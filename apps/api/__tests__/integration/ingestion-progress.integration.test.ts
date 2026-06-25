import { randomUUID } from 'node:crypto'
import type { PgBoss } from '@dialogus/db/pgboss'
import { books, chapters, type IngestionStageProgress } from '@dialogus/db/schema'
import { resetStagesFrom } from '@dialogus/ingestion/application/stages/_common'
import { summarizeStage } from '@dialogus/ingestion/application/stages/summarize'
import { MockChapterSummaryGenerator } from '@dialogus/ingestion/infrastructure/external/MockChapterSummaryGenerator'
import { DrizzleChapterRepository } from '@dialogus/ingestion/infrastructure/persistence/DrizzleChapterRepository'
import { DrizzleChapterSummaryRepository } from '@dialogus/ingestion/infrastructure/persistence/DrizzleChapterSummaryRepository'
import { eq } from 'drizzle-orm'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  dockerAvailable,
  insertDiscoveredBook,
  type PostgresContext,
  startPostgres,
  stopPostgres,
} from './_helpers/setup'

/**
 * Feature 002 — per-stage progress records persist correctly across the real
 * Postgres jsonb column, the resume reset preserves earlier stages, and a
 * degenerate (0-chapter) book resolves to a terminal state (FR-017).
 *
 * Gated on Docker (Testcontainers), like the rest of the integration suite.
 */

const logger = pino({ level: 'silent' })

function makeFakeBoss(): PgBoss & { send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(async () => 'fake-job-id')
  return { send } as unknown as PgBoss & { send: ReturnType<typeof vi.fn> }
}

async function seedChapters(pg: PostgresContext, bookId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await pg.db.insert(chapters).values({
      id: randomUUID(),
      bookId,
      ordinal: i,
      title: `Chapter ${i + 1}`,
      plainText: `Body of chapter ${i + 1}.`,
      tokenCount: 100 + i,
    })
  }
}

async function readStages(pg: PostgresContext, bookId: string): Promise<IngestionStageProgress[]> {
  const row = await pg.db.query.books.findFirst({
    where: eq(books.id, bookId),
    columns: { ingestionStages: true },
  })
  return row?.ingestionStages ?? []
}

function summarizeDeps(pg: PostgresContext) {
  return {
    db: pg.db,
    logger,
    pgboss: makeFakeBoss(),
    chapterRepo: new DrizzleChapterRepository(pg.db),
    chapterSummaryRepo: new DrizzleChapterSummaryRepository(pg.db),
    chapterSummaryGenerator: new MockChapterSummaryGenerator(),
  }
}

describe.skipIf(!dockerAvailable)('ingestion progress — stage records (Testcontainers)', () => {
  let pg: PostgresContext

  beforeAll(async () => {
    pg = await startPostgres()
  }, 120_000)

  afterAll(async () => {
    if (pg) await stopPostgres(pg)
  })

  it('persists per-stage records with units when a real stage runs', async () => {
    const bookId = await insertDiscoveredBook(pg.db, {
      gutendexId: 900_001,
      title: 'Stage Records',
    })
    await seedChapters(pg, bookId, 5)

    await summarizeStage({ bookId }, summarizeDeps(pg))

    const stages = await readStages(pg, bookId)
    expect(stages).toHaveLength(7)
    const summarize = stages.find((s) => s.stage === 'summarize')
    expect(summarize?.state).toBe('done')
    expect(summarize?.unit).toBe('chapters')
    expect(summarize?.units_done).toBe(5)
    expect(summarize?.units_total).toBe(5)
    // The hand-off queued the embed stage.
    expect(stages.find((s) => s.stage === 'embed')?.state).toBe('queued')
  })

  it('resume reset preserves earlier records and re-pends the resumed stage', async () => {
    const bookId = await insertDiscoveredBook(pg.db, { gutendexId: 900_002, title: 'Resume' })

    const before: IngestionStageProgress[] = [
      {
        stage: 'download',
        state: 'done',
        units_done: 10,
        units_total: 10,
        unit: 'bytes',
        started_at: '2026-06-23T00:00:00.000Z',
        ended_at: '2026-06-23T00:00:05.000Z',
        attempt: 1,
        cached: false,
      },
      {
        stage: 'clean',
        state: 'skipped',
        units_done: null,
        units_total: null,
        unit: null,
        started_at: null,
        ended_at: null,
        attempt: 1,
        cached: true,
      },
      {
        stage: 'parse',
        state: 'done',
        units_done: null,
        units_total: null,
        unit: null,
        started_at: null,
        ended_at: null,
        attempt: 1,
        cached: false,
      },
      {
        stage: 'chunk',
        state: 'done',
        units_done: 12,
        units_total: 12,
        unit: 'chunks',
        started_at: null,
        ended_at: null,
        attempt: 1,
        cached: false,
      },
      {
        stage: 'summarize',
        state: 'done',
        units_done: 5,
        units_total: 5,
        unit: 'chapters',
        started_at: null,
        ended_at: null,
        attempt: 1,
        cached: false,
      },
      {
        stage: 'embed',
        state: 'failed',
        units_done: 3,
        units_total: 12,
        unit: 'chunks',
        started_at: null,
        ended_at: null,
        attempt: 1,
        cached: false,
      },
      {
        stage: 'index',
        state: 'pending',
        units_done: null,
        units_total: null,
        unit: null,
        started_at: null,
        ended_at: null,
        attempt: 1,
        cached: false,
      },
    ]
    await pg.db.update(books).set({ ingestionStages: before }).where(eq(books.id, bookId))

    const reset = resetStagesFrom(before, 'embed')
    await pg.db.update(books).set({ ingestionStages: reset }).where(eq(books.id, bookId))

    const after = await readStages(pg, bookId)
    expect(after.find((s) => s.stage === 'download')?.state).toBe('done')
    expect(after.find((s) => s.stage === 'summarize')?.state).toBe('done')
    expect(after.find((s) => s.stage === 'embed')?.state).toBe('pending')
    expect(after.find((s) => s.stage === 'embed')?.units_done).toBeNull()
  })

  it('resolves a 0-chapter book to a terminal (non-failed) summarize (FR-017)', async () => {
    const bookId = await insertDiscoveredBook(pg.db, { gutendexId: 900_003, title: 'Empty' })
    // No chapters seeded.

    await summarizeStage({ bookId }, summarizeDeps(pg))

    const row = await pg.db.query.books.findFirst({
      where: eq(books.id, bookId),
      columns: { ingestionStatus: true, ingestionStages: true },
    })
    expect(row?.ingestionStatus).not.toBe('failed')
    expect(row?.ingestionStages?.find((s) => s.stage === 'summarize')?.state).toBe('done')
  })
})
