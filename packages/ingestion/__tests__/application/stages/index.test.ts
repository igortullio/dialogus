import type { Database } from '@dialogus/db/client'
import type { PgBoss } from '@dialogus/db/pgboss'
import { describe, expect, it, vi } from 'vitest'
import type { BookRecordForStage } from '../../../src/application/stages/_common'
import { type IndexStageDeps, indexStage } from '../../../src/application/stages/index'
import { IndexError } from '../../../src/domain/ingestion/IngestionError'

const BOOK_ID = 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1'
const GUTENDEX_ID = 1234

interface UpdateCall {
  set: Record<string, unknown>
}

interface ExecuteCall {
  sqlText: string
}

function describeSql(value: unknown): string {
  if (value && typeof value === 'object') {
    const queryChunks = (value as { queryChunks?: ReadonlyArray<{ value?: readonly string[] }> })
      .queryChunks
    if (Array.isArray(queryChunks)) {
      return queryChunks
        .flatMap((q) => (Array.isArray(q?.value) ? q.value : []))
        .filter((v) => typeof v === 'string')
        .join(' ')
    }
  }
  return String(value)
}

function makeMockDb(book: BookRecordForStage | null, opts: { failExecute?: boolean } = {}) {
  const updates: UpdateCall[] = []
  const executeCalls: ExecuteCall[] = []
  const findFirst = vi.fn(async () => book ?? undefined)
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's update chain shape
  const updateChain: any = {
    set(value: Record<string, unknown>) {
      this._set = value
      return this
    },
    where(_cond: unknown) {
      updates.push({ set: this._set as Record<string, unknown> })
      return Promise.resolve()
    },
  }
  const execute = vi.fn(async (sqlValue: unknown) => {
    executeCalls.push({ sqlText: describeSql(sqlValue) })
    if (opts.failExecute) {
      throw new Error('VACUUM cannot run inside a transaction block')
    }
  })
  const db = {
    query: { books: { findFirst } },
    update: vi.fn(() => updateChain),
    execute,
  } as unknown as Database
  return { db, updates, executeCalls, execute }
}

function makeBook(overrides: Partial<BookRecordForStage> = {}): BookRecordForStage {
  return {
    id: BOOK_ID,
    gutendexId: GUTENDEX_ID,
    languages: ['en'],
    ingestionStatus: 'embedding',
    ingestionLastStage: 'embed',
    ingestionStartedAt: new Date('2026-04-26T10:00:00Z'),
    rawHash: 'some-hash',
    downloadUrlEpub: 'https://example.test/epub',
    downloadUrlTxt: null,
    ...overrides,
  }
}

interface CapturedLog {
  level: 'info' | 'warn' | 'error'
  meta: Record<string, unknown>
  msg: string
}

function makeLogger(): { logger: IndexStageDeps['logger']; logs: CapturedLog[] } {
  const logs: CapturedLog[] = []
  const logger: IndexStageDeps['logger'] = {
    info(meta, msg) {
      logs.push({ level: 'info', meta, msg })
    },
    warn(meta, msg) {
      logs.push({ level: 'warn', meta, msg })
    },
    error(meta, msg) {
      logs.push({ level: 'error', meta, msg })
    },
  }
  return { logger, logs }
}

function makePgBoss(): PgBoss & { send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(async () => 'job-id-123')
  return { send } as unknown as PgBoss & { send: ReturnType<typeof vi.fn> }
}

describe('indexStage — happy path', () => {
  it('runs VACUUM ANALYZE chunks via db.execute', async () => {
    const book = makeBook()
    const { db, executeCalls } = makeMockDb(book)
    const { logger } = makeLogger()

    await indexStage({ bookId: BOOK_ID }, { db, logger })

    expect(executeCalls).toHaveLength(1)
    expect(executeCalls[0]?.sqlText).toContain('VACUUM ANALYZE')
    expect(executeCalls[0]?.sqlText).toContain('chunks')
  })

  it('sets ingestion_status=ready, indexed_at=now(), ingestion_progress=100', async () => {
    const book = makeBook()
    const { db, updates } = makeMockDb(book)
    const { logger } = makeLogger()

    await indexStage({ bookId: BOOK_ID }, { db, logger })

    // Expect at least two updates: an initial transition to indexing + a final transition to ready.
    const initial = updates[0]?.set
    expect(initial?.ingestionStatus).toBe('indexing')
    expect(initial?.ingestionProgress).toBe(0)
    expect(initial?.ingestionLastStage).toBe('index')

    const final = updates.at(-1)?.set
    expect(final?.ingestionStatus).toBe('ready')
    expect(final?.ingestionProgress).toBe(100)
    expect(final?.indexedAt).toBeInstanceOf(Date)
  })

  it('emits a final pino log with { book_id, total_duration_ms, stage: "index" }', async () => {
    const book = makeBook({ ingestionStartedAt: new Date('2026-04-26T10:00:00Z') })
    const { db } = makeMockDb(book)
    const { logger, logs } = makeLogger()

    await indexStage({ bookId: BOOK_ID }, { db, logger })

    const completion = logs.find((l) => l.meta.event === 'stage_completed')
    expect(completion).toBeDefined()
    expect(completion?.meta).toMatchObject({
      stage: 'index',
      book_id: BOOK_ID,
    })
    expect(typeof completion?.meta.total_duration_ms).toBe('number')
  })

  it('does NOT call pgboss.send (terminal stage) — pgboss is not even part of IndexStageDeps', async () => {
    const book = makeBook()
    const { db } = makeMockDb(book)
    const { logger } = makeLogger()
    const pgboss = makePgBoss()

    await indexStage({ bookId: BOOK_ID }, { db, logger })

    expect(pgboss.send).not.toHaveBeenCalled()
  })

  it('logs total_duration_ms as null when ingestion_started_at is missing', async () => {
    const book = makeBook({ ingestionStartedAt: null })
    const { db } = makeMockDb(book)
    const { logger, logs } = makeLogger()

    await indexStage({ bookId: BOOK_ID }, { db, logger })

    const completion = logs.find((l) => l.meta.event === 'stage_completed')
    expect(completion?.meta.total_duration_ms).toBeNull()
  })
})

describe('indexStage — failure path', () => {
  it('marks the book failed, logs an error, and rethrows IndexError when VACUUM fails', async () => {
    const book = makeBook()
    const { db, updates } = makeMockDb(book, { failExecute: true })
    const { logger, logs } = makeLogger()

    await expect(indexStage({ bookId: BOOK_ID }, { db, logger })).rejects.toBeInstanceOf(IndexError)

    const failureUpdate = updates.at(-1)?.set
    expect(failureUpdate?.ingestionStatus).toBe('failed')
    expect(failureUpdate?.ingestionError).toContain('ingestion-index-failed')
    expect(logs.find((l) => l.level === 'error')?.meta).toMatchObject({
      stage: 'index',
      error_slug: 'ingestion-index-failed',
    })
  })
})
