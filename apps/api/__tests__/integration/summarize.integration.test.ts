import { randomUUID } from 'node:crypto'
import type { PgBoss } from '@dialogus/db/pgboss'
import { books, chapterSummaries, chapters } from '@dialogus/db/schema'
import { summarizeStage } from '@dialogus/ingestion/application/stages/summarize'
import { MockChapterSummaryGenerator } from '@dialogus/ingestion/infrastructure/external/MockChapterSummaryGenerator'
import { DrizzleChapterRepository } from '@dialogus/ingestion/infrastructure/persistence/DrizzleChapterRepository'
import { DrizzleChapterSummaryRepository } from '@dialogus/ingestion/infrastructure/persistence/DrizzleChapterSummaryRepository'
import { eq, sql } from 'drizzle-orm'
import { pino } from 'pino'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dockerAvailable,
  insertDiscoveredBook,
  type PostgresContext,
  startPostgres,
  stopPostgres,
} from './_helpers/setup'

interface FakeBoss {
  readonly send: ReturnType<typeof vi.fn>
}

function makeFakeBoss(): FakeBoss & PgBoss {
  const send = vi.fn(async () => 'fake-job-id')
  return { send } as unknown as FakeBoss & PgBoss
}

async function seedChapters(pg: PostgresContext, bookId: string, count: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const id = randomUUID()
    ids.push(id)
    await pg.db.insert(chapters).values({
      id,
      bookId,
      ordinal: i,
      title: `Chapter ${i + 1}`,
      plainText: `Plain text body of chapter ${i + 1}.`,
      tokenCount: 100 + i,
    })
  }
  return ids
}

async function setBookChunked(pg: PostgresContext, bookId: string): Promise<void> {
  await pg.db
    .update(books)
    .set({
      ingestionStatus: 'chunking',
      ingestionLastStage: 'chunk',
      updatedAt: sql`now()`,
    })
    .where(eq(books.id, bookId))
}

describe.skipIf(!dockerAvailable)('summarize stage — integration against Testcontainers', () => {
  let pg: PostgresContext

  beforeAll(async () => {
    pg = await startPostgres()
  }, 180_000)

  afterAll(async () => {
    if (pg) await stopPostgres(pg)
  })

  let boss: FakeBoss & PgBoss

  beforeEach(() => {
    boss = makeFakeBoss()
  })

  afterEach(async () => {
    await pg.db.delete(books)
  })

  it('persists 5 chapter_summaries rows and transitions to embedding', async () => {
    const bookId = await insertDiscoveredBook(pg.db, {
      gutendexId: 700001,
      title: 'Five-Chapter Book',
      languages: ['en'],
    })
    await setBookChunked(pg, bookId)
    await seedChapters(pg, bookId, 5)

    const chapterRepo = new DrizzleChapterRepository(pg.db)
    const summaryRepo = new DrizzleChapterSummaryRepository(pg.db)
    const generator = new MockChapterSummaryGenerator()

    await summarizeStage(
      { bookId },
      {
        db: pg.db,
        logger: pino({ level: 'silent' }),
        pgboss: boss,
        chapterRepo,
        chapterSummaryRepo: summaryRepo,
        chapterSummaryGenerator: generator,
      },
    )

    const summaryRows = await pg.db
      .select()
      .from(chapterSummaries)
      .where(eq(chapterSummaries.bookId, bookId))
    expect(summaryRows).toHaveLength(5)
    for (const row of summaryRows) {
      expect(row.summary.length).toBeGreaterThan(0)
      expect(row.model).toBe('mock-summary-generator')
    }

    expect(boss.send).toHaveBeenCalledWith('ingestion.embed', { bookId })

    const ready = await pg.db.query.books.findFirst({ where: eq(books.id, bookId) })
    // Stage handler leaves the book in 'summarizing' until the embed handler picks up the queue
    // and flips it to 'embedding'. summarize itself only enqueues the next stage.
    expect(ready?.ingestionStatus).toBe('summarizing')
    expect(ready?.ingestionLastStage).toBe('summarize')
    expect(ready?.ingestionProgress).toBe(100)
  })

  it('resume: 5 chapters with 2 already summarized → 5 total summaries (existing untouched)', async () => {
    const bookId = await insertDiscoveredBook(pg.db, {
      gutendexId: 700002,
      title: 'Resume Book',
      languages: ['pt'],
    })
    await setBookChunked(pg, bookId)
    const chapterIds = await seedChapters(pg, bookId, 5)

    const summaryRepo = new DrizzleChapterSummaryRepository(pg.db)
    const preExisting = chapterIds.slice(0, 2)
    for (const chapterId of preExisting) {
      await summaryRepo.save({
        id: randomUUID(),
        chapterId,
        bookId,
        summary: `Pre-existing summary for ${chapterId}`,
        tokenCount: 7,
        model: 'pre-existing-model',
        generatedAt: new Date('2026-04-01T00:00:00Z'),
      })
    }

    const chapterRepo = new DrizzleChapterRepository(pg.db)
    const generator = new MockChapterSummaryGenerator()
    const generateSpy = vi.spyOn(generator, 'generate')

    await summarizeStage(
      { bookId },
      {
        db: pg.db,
        logger: pino({ level: 'silent' }),
        pgboss: boss,
        chapterRepo,
        chapterSummaryRepo: summaryRepo,
        chapterSummaryGenerator: generator,
      },
    )

    expect(generateSpy).toHaveBeenCalledTimes(3)
    for (const call of generateSpy.mock.calls) {
      expect(call[1]).toBe('pt')
    }

    const summaryRows = await pg.db
      .select()
      .from(chapterSummaries)
      .where(eq(chapterSummaries.bookId, bookId))
    expect(summaryRows).toHaveLength(5)

    const preserved = summaryRows.filter((r) => r.model === 'pre-existing-model')
    expect(preserved).toHaveLength(2)
    for (const row of preserved) {
      expect(row.summary).toMatch(/^Pre-existing summary/)
    }

    expect(boss.send).toHaveBeenCalledWith('ingestion.embed', { bookId })
  })
})
