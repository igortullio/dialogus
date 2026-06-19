import type { Database } from '@dialogus/db'
import { getTableName } from 'drizzle-orm'
import { Hono } from 'hono'
import { pino, stdSerializers } from 'pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProblemMiddleware } from '../../src/infrastructure/http/middleware/problem'
import { createLibraryRoute } from '../../src/infrastructure/http/routes/library'

interface BookRow {
  id: string
  ingestionStatus: string
  ingestionProgress?: number
  ingestionError?: string | null
  ingestionLastStage?: string | null
  ingestionStartedAt?: Date | null
  indexedAt?: Date | null
}

interface ChunkJoinedRow {
  chunk: {
    id: string
    bookId: string
    chapterId: string
    ordinal: number
    text: string
    tokenCount: number
    startChar: number
    endChar: number
  }
  chapter: { ordinal: number; title: string }
}

interface IdempotencyRow {
  key: string
  requestHash: string
  responseStatus: number
  responseBody: unknown
}

interface FakeDbState {
  bookFindFirst: ReturnType<typeof vi.fn>
  selectChain: { rows: ChunkJoinedRow[] }
  idempotencySelectRows: IdempotencyRow[]
  idempotencyInsertSpy: ReturnType<typeof vi.fn>
}

function buildFakeDb(initial: {
  book?: BookRow | null
  chunkJoinRows?: ChunkJoinedRow[]
  idempotencyRows?: IdempotencyRow[]
}): { db: Database; state: FakeDbState } {
  const bookFindFirst = vi.fn().mockResolvedValue(initial.book ?? null)

  const idempotencyInsertSpy = vi.fn().mockResolvedValue(undefined)
  const state: FakeDbState = {
    bookFindFirst,
    selectChain: { rows: initial.chunkJoinRows ?? [] },
    idempotencySelectRows: initial.idempotencyRows ?? [],
    idempotencyInsertSpy,
  }

  // db.select().from(table).innerJoin?(table, on).where(cond).limit(n)
  const select = vi.fn().mockImplementation((_columns?: unknown) => {
    let isIdempotencyQuery = false

    const limit = vi.fn().mockImplementation(async () => {
      if (isIdempotencyQuery) return state.idempotencySelectRows
      return state.selectChain.rows
    })
    const where = vi.fn().mockImplementation(() => ({ limit }))
    const innerJoin = vi.fn().mockImplementation(() => ({ where }))
    const from = vi.fn().mockImplementation((tbl: object) => {
      try {
        if (getTableName(tbl as Parameters<typeof getTableName>[0]) === 'idempotency_keys') {
          isIdempotencyQuery = true
        }
      } catch {
        // ignore — non-table values
      }
      return { innerJoin, where, limit }
    })
    return { from }
  })

  const insert = vi.fn().mockImplementation(() => ({
    values: idempotencyInsertSpy,
  }))

  // ingestBook flips the row to "downloading" via db.update(...).set(...).where(...)
  const update = vi.fn().mockImplementation(() => ({
    set: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  }))

  const db = {
    query: { books: { findFirst: bookFindFirst } },
    select,
    insert,
    update,
  } as unknown as Database

  return { db, state }
}

function buildApp(deps: { db: Database; enqueueImpl?: ReturnType<typeof vi.fn> }): {
  app: Hono
  logger: ReturnType<typeof pino>
} {
  const logger = pino({ level: 'silent', serializers: { error: stdSerializers.err } }, {
    write() {},
  } as unknown as NodeJS.WritableStream)

  const app = new Hono()
  app.use('*', createProblemMiddleware({ logger }))
  const route = createLibraryRoute({
    db: deps.db,
    logger,
    enqueueDeps: { databaseUrl: 'postgres://test' },
    ...(deps.enqueueImpl ? { enqueueImpl: deps.enqueueImpl } : {}),
    addBookToLibrary: vi.fn(),
    listLibrary: vi.fn(),
    getBook: vi.fn(),
    removeBook: vi.fn(),
    restoreBook: vi.fn(),
  })
  app.route('/api/library', route)
  return { app, logger }
}

const BOOK_ID = '00000000-0000-4000-8000-000000000001'
const CHUNK_ID = '00000000-0000-4000-8000-000000000002'

function postIngest(headers: Record<string, string> = {}): Request {
  return new Request(`http://local/api/library/books/${BOOK_ID}/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: '',
  })
}

function postRetry(headers: Record<string, string> = {}): Request {
  return new Request(`http://local/api/library/books/${BOOK_ID}/ingest/retry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: '',
  })
}

function getIngestion(): Request {
  return new Request(`http://local/api/library/books/${BOOK_ID}/ingestion`, { method: 'GET' })
}

function getChunkRequest(id: string = CHUNK_ID): Request {
  return new Request(`http://local/api/library/chunks/${id}`, { method: 'GET' })
}

describe('POST /api/library/books/:id/ingest', () => {
  let enqueueImpl: ReturnType<typeof vi.fn>

  beforeEach(() => {
    enqueueImpl = vi.fn().mockResolvedValue('job-1')
  })

  it('enqueues ingestion.download and returns 202 envelope when book is discovered', async () => {
    const { db } = buildFakeDb({ book: { id: BOOK_ID, ingestionStatus: 'discovered' } })
    const { app } = buildApp({ db, enqueueImpl })

    const res = await app.request(postIngest())
    const body = (await res.json()) as { data: Record<string, unknown> }

    expect(res.status).toBe(202)
    expect(body.data).toEqual({
      book_id: BOOK_ID,
      status: 'downloading',
      stage: 'download',
      job_id: 'job-1',
    })
    expect(enqueueImpl).toHaveBeenCalledTimes(1)
    expect(enqueueImpl).toHaveBeenCalledWith(
      { databaseUrl: 'postgres://test' },
      'ingestion.download',
      { bookId: BOOK_ID },
    )
  })

  it('returns 409 book-not-in-discovered-state when book is downloading', async () => {
    const { db } = buildFakeDb({ book: { id: BOOK_ID, ingestionStatus: 'downloading' } })
    const { app } = buildApp({ db, enqueueImpl })

    const res = await app.request(postIngest())
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(409)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe('urn:dialogus:problems:book-not-in-discovered-state')
    expect(enqueueImpl).not.toHaveBeenCalled()
  })

  it('returns 409 book-not-in-discovered-state when book is ready', async () => {
    const { db } = buildFakeDb({ book: { id: BOOK_ID, ingestionStatus: 'ready' } })
    const { app } = buildApp({ db, enqueueImpl })

    const res = await app.request(postIngest())
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(409)
    expect(body.type).toBe('urn:dialogus:problems:book-not-in-discovered-state')
    expect(enqueueImpl).not.toHaveBeenCalled()
  })

  it('returns 404 book-not-found when book does not exist', async () => {
    const { db } = buildFakeDb({ book: null })
    const { app } = buildApp({ db, enqueueImpl })

    const res = await app.request(postIngest())
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(404)
    expect(body.type).toBe('urn:dialogus:problems:book-not-found')
    expect(enqueueImpl).not.toHaveBeenCalled()
  })

  it('replays the cached 202 response when Idempotency-Key matches', async () => {
    const cachedBody = {
      data: {
        book_id: BOOK_ID,
        status: 'downloading',
        stage: 'download',
        job_id: 'job-cached',
      },
    }
    const requestHash = '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b' // sha256 of "null"
    const { db } = buildFakeDb({
      book: { id: BOOK_ID, ingestionStatus: 'discovered' },
      idempotencyRows: [
        { key: 'idem-1', requestHash, responseStatus: 202, responseBody: cachedBody },
      ],
    })
    const { app } = buildApp({ db, enqueueImpl })

    const res = await app.request(postIngest({ 'Idempotency-Key': 'idem-1' }))
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(202)
    expect(res.headers.get('X-Idempotency-Replay')).toBe('true')
    expect(body).toEqual(cachedBody)
    expect(enqueueImpl).not.toHaveBeenCalled()
  })
})

describe('GET /api/library/books/:id/ingestion', () => {
  it('returns envelope with full IngestionStatusDto for an in-flight book', async () => {
    const startedAt = new Date('2026-01-01T00:00:00.000Z')
    const { db } = buildFakeDb({
      book: {
        id: BOOK_ID,
        ingestionStatus: 'embedding',
        ingestionProgress: 42,
        ingestionError: null,
        ingestionLastStage: 'embed',
        ingestionStartedAt: startedAt,
        indexedAt: null,
      },
    })
    const { app } = buildApp({ db })

    const res = await app.request(getIngestion())
    const body = (await res.json()) as { data: Record<string, unknown> }

    expect(res.status).toBe(200)
    expect(body.data).toEqual({
      book_id: BOOK_ID,
      status: 'embedding',
      stage: 'embed',
      progress: 42,
      started_at: startedAt.toISOString(),
      indexed_at: null,
      last_stage: 'embed',
      error: null,
    })
  })

  it('reports the failed-stage and parsed error fields for a failed book', async () => {
    const startedAt = new Date('2026-01-01T00:00:00.000Z')
    const { db } = buildFakeDb({
      book: {
        id: BOOK_ID,
        ingestionStatus: 'failed',
        ingestionProgress: 17,
        ingestionError: 'ingestion-embed-failed: openai 503',
        ingestionLastStage: 'embed',
        ingestionStartedAt: startedAt,
        indexedAt: null,
      },
    })
    const { app } = buildApp({ db })

    const res = await app.request(getIngestion())
    const body = (await res.json()) as { data: Record<string, unknown> }

    expect(res.status).toBe(200)
    expect(body.data).toMatchObject({
      status: 'failed',
      stage: 'embed',
      last_stage: 'embed',
      error: { slug: 'ingestion-embed-failed', message: 'openai 503', retryable: true },
    })
  })

  it('returns 404 book-not-found when the book id does not exist', async () => {
    const { db } = buildFakeDb({ book: null })
    const { app } = buildApp({ db })

    const res = await app.request(getIngestion())
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(404)
    expect(body.type).toBe('urn:dialogus:problems:book-not-found')
  })
})

describe('POST /api/library/books/:id/ingest/retry', () => {
  let enqueueImpl: ReturnType<typeof vi.fn>

  beforeEach(() => {
    enqueueImpl = vi.fn().mockResolvedValue('job-retry')
  })

  it('enqueues ingestion.<last_stage> when book is failed', async () => {
    const { db } = buildFakeDb({
      book: { id: BOOK_ID, ingestionStatus: 'failed', ingestionLastStage: 'embed' },
    })
    const { app } = buildApp({ db, enqueueImpl })

    const res = await app.request(postRetry())
    const body = (await res.json()) as { data: Record<string, unknown> }

    expect(res.status).toBe(202)
    expect(body.data).toEqual({
      book_id: BOOK_ID,
      status: 'embedding',
      stage: 'embed',
      job_id: 'job-retry',
    })
    expect(enqueueImpl).toHaveBeenCalledWith(
      { databaseUrl: 'postgres://test' },
      'ingestion.embed',
      { bookId: BOOK_ID },
    )
  })

  it('falls back to ingestion.download when ingestion_last_stage is null', async () => {
    const { db } = buildFakeDb({
      book: { id: BOOK_ID, ingestionStatus: 'failed', ingestionLastStage: null },
    })
    const { app } = buildApp({ db, enqueueImpl })

    const res = await app.request(postRetry())
    const body = (await res.json()) as { data: Record<string, unknown> }

    expect(res.status).toBe(202)
    expect(body.data).toMatchObject({ stage: 'download', status: 'downloading' })
    expect(enqueueImpl).toHaveBeenCalledWith(
      { databaseUrl: 'postgres://test' },
      'ingestion.download',
      { bookId: BOOK_ID },
    )
  })

  it('returns 409 book-already-ready when book is ready', async () => {
    const { db } = buildFakeDb({ book: { id: BOOK_ID, ingestionStatus: 'ready' } })
    const { app } = buildApp({ db, enqueueImpl })

    const res = await app.request(postRetry())
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(409)
    expect(body.type).toBe('urn:dialogus:problems:book-already-ready')
    expect(enqueueImpl).not.toHaveBeenCalled()
  })

  it('returns 409 book-not-in-retryable-state when book is discovered', async () => {
    const { db } = buildFakeDb({ book: { id: BOOK_ID, ingestionStatus: 'discovered' } })
    const { app } = buildApp({ db, enqueueImpl })

    const res = await app.request(postRetry())
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(409)
    expect(body.type).toBe('urn:dialogus:problems:book-not-in-retryable-state')
    expect(enqueueImpl).not.toHaveBeenCalled()
  })
})

describe('GET /api/library/chunks/:id', () => {
  it('returns envelope with chapter_title + chapter_ordinal joined in', async () => {
    const { db } = buildFakeDb({
      chunkJoinRows: [
        {
          chunk: {
            id: CHUNK_ID,
            bookId: BOOK_ID,
            chapterId: '00000000-0000-4000-8000-000000000099',
            ordinal: 7,
            text: 'Call me Ishmael.',
            tokenCount: 4,
            startChar: 0,
            endChar: 16,
          },
          chapter: { ordinal: 1, title: 'Loomings' },
        },
      ],
    })
    const { app } = buildApp({ db })

    const res = await app.request(getChunkRequest())
    const body = (await res.json()) as { data: Record<string, unknown> }

    expect(res.status).toBe(200)
    expect(body.data).toEqual({
      id: CHUNK_ID,
      book_id: BOOK_ID,
      chapter_id: '00000000-0000-4000-8000-000000000099',
      chapter_title: 'Loomings',
      chapter_ordinal: 1,
      ordinal: 7,
      text: 'Call me Ishmael.',
      token_count: 4,
      start_char: 0,
      end_char: 16,
    })
  })

  it('returns 404 chunk-not-found for an unknown id', async () => {
    const { db } = buildFakeDb({ chunkJoinRows: [] })
    const { app } = buildApp({ db })

    const res = await app.request(getChunkRequest())
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(404)
    expect(body.type).toBe('urn:dialogus:problems:chunk-not-found')
  })
})
