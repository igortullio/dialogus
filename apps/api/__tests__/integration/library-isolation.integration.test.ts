import { addBookToLibrary, getBook, listLibrary, removeBook, restoreBook } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { books, idempotencyKeys, libraryEntries } from '@dialogus/db/schema'
import { PROBLEM_TYPE_PREFIX } from '@dialogus/shared/http/problem'
import type { IngestionStatus } from '@dialogus/shared/schemas/ingestion'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { setupServer } from 'msw/node'
import { pino } from 'pino'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  FIXTURE_BASE_URL,
  happyPathHandlers,
} from '../../../../packages/catalog/__fixtures__/gutendex/handlers'
import { GutendexHttpClient } from '../../../../packages/catalog/src/infrastructure/external/GutendexHttpClient'
import { DrizzleBookRepository } from '../../../../packages/catalog/src/infrastructure/persistence/DrizzleBookRepository'
import { DrizzleLibraryEntryRepository } from '../../../../packages/catalog/src/infrastructure/persistence/DrizzleLibraryEntryRepository'
import {
  createProblemMiddleware,
  type ProblemVariables,
} from '../../src/infrastructure/http/middleware/problem'
import { createLibraryRoute } from '../../src/infrastructure/http/routes/library'
import type { enqueue } from '../../src/infrastructure/pgboss/enqueue'
import { headerAuth } from '../_helpers/auth'
import {
  addLibraryMembership,
  createTestUser,
  dockerAvailable,
  type PostgresContext,
  startPostgres,
  stopPostgres,
} from './_helpers/setup'

const USER_A = 'user-iso-a'
const USER_B = 'user-iso-b'
// The MSW fixture only serves GET /books/996, so the live resolve-or-create add
// path can only use 996; all other books are seeded directly.
const GUTENDEX_996 = 996
const CONCURRENCY_LIMIT = 2

interface EnqueueCall {
  readonly queue: string
  readonly singletonKey: string | undefined
}

const server = setupServer(...happyPathHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const enqueued: EnqueueCall[] = []

function recordingEnqueue(): typeof enqueue {
  return (async (
    _deps: unknown,
    queue: string,
    _data: unknown,
    options?: { singletonKey?: string },
  ) => {
    enqueued.push({ queue, singletonKey: options?.singletonKey })
    return `job-${enqueued.length}`
  }) as unknown as typeof enqueue
}

function buildApp(db: Database): Hono<{ Variables: ProblemVariables }> {
  const repository = new DrizzleBookRepository(db)
  const libraryRepo = new DrizzleLibraryEntryRepository(db)
  const client = new GutendexHttpClient({
    baseUrl: FIXTURE_BASE_URL,
    retryBaseDelayMs: 1,
    sleep: async () => {},
  })

  const app = new Hono<{ Variables: ProblemVariables }>()
  app.use('*', createProblemMiddleware({ logger: pino({ level: 'silent' }) }))
  app.route(
    '/api/library',
    createLibraryRoute({
      db,
      auth: headerAuth({ [USER_A]: { id: USER_A }, [USER_B]: { id: USER_B } }),
      libraryRepo,
      concurrencyLimit: CONCURRENCY_LIMIT,
      enqueueDeps: { databaseUrl: 'postgres://test' },
      enqueueImpl: recordingEnqueue(),
      addBookToLibrary: (userId, gutendexId) =>
        addBookToLibrary({ repository, libraryRepo, client }, userId, gutendexId),
      listLibrary: (userId, input) => listLibrary({ libraryRepo }, userId, input),
      getBook: (userId, id) => getBook({ repository, libraryRepo }, userId, id),
      removeBook: (userId, id) => removeBook({ libraryRepo }, userId, id),
      restoreBook: (userId, id) => restoreBook({ repository, libraryRepo }, userId, id),
    }),
  )
  return app
}

async function insertBookWithStatus(
  db: Database,
  gutendexId: number,
  status: IngestionStatus,
): Promise<string> {
  const [row] = await db
    .insert(books)
    .values({
      gutendexId,
      title: `Book ${gutendexId}`,
      authors: [{ name: 'Test Author', birthYear: null, deathYear: null }],
      languages: ['en'],
      subjects: [],
      ingestionStatus: status,
    })
    .returning({ id: books.id })
  if (!row) throw new Error('failed to insert book')
  return row.id
}

function asUser(userId: string, path: string, init: RequestInit = {}): Request {
  return new Request(`http://local${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-test-user': userId, ...(init.headers ?? {}) },
  })
}

function postBook(userId: string, gutendexId: number): Request {
  return asUser(userId, '/api/library/books', {
    method: 'POST',
    body: JSON.stringify({ gutendex_id: gutendexId }),
  })
}

async function listCount(
  app: Hono<{ Variables: ProblemVariables }>,
  userId: string,
): Promise<number> {
  const res = await app.request(asUser(userId, '/api/library/books'))
  const body = (await res.json()) as { data: unknown[] }
  return body.data.length
}

describe.skipIf(!dockerAvailable)('US2 library isolation (Testcontainers + MSW)', () => {
  let pg: PostgresContext
  let app: Hono<{ Variables: ProblemVariables }>

  beforeAll(async () => {
    pg = await startPostgres()
    await createTestUser(pg.db, { id: USER_A, email: 'iso-a@test.local' })
    await createTestUser(pg.db, { id: USER_B, email: 'iso-b@test.local' })
    app = buildApp(pg.db)
  }, 180_000)

  afterAll(async () => {
    if (pg) await stopPostgres(pg)
  })

  beforeEach(async () => {
    await pg.db.delete(idempotencyKeys)
    await pg.db.delete(libraryEntries)
    await pg.db.delete(books)
    enqueued.length = 0
  })

  it('scopes library_entries per user — A adds a title, B sees nothing', async () => {
    const res = await app.request(postBook(USER_A, GUTENDEX_996))
    expect(res.status).toBe(201)

    expect(await listCount(app, USER_A)).toBe(1)
    expect(await listCount(app, USER_B)).toBe(0)
  })

  it('returns book-not-found for cross-user direct access (no existence leak, SC-002)', async () => {
    const bookId = await insertBookWithStatus(pg.db, 5001, 'discovered')
    await addLibraryMembership(pg.db, USER_A, bookId)

    // B is not a member: get / ingest / status all 404 book-not-found.
    for (const path of [`/api/library/books/${bookId}`, `/api/library/books/${bookId}/ingestion`]) {
      const res = await app.request(asUser(USER_B, path))
      const body = (await res.json()) as Record<string, unknown>
      expect(res.status).toBe(404)
      expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}book-not-found`)
    }

    const ingestRes = await app.request(
      asUser(USER_B, `/api/library/books/${bookId}/ingest`, { method: 'POST' }),
    )
    expect(ingestRes.status).toBe(404)
    expect(((await ingestRes.json()) as Record<string, unknown>).type).toBe(
      `${PROBLEM_TYPE_PREFIX}book-not-found`,
    )
  })

  it('reuses the shared corpus instantly — re-adding a ready title needs no ingestion (SC-003/004)', async () => {
    const sharedId = await insertBookWithStatus(pg.db, 5002, 'ready')

    const resA = await app.request(postBook(USER_A, 5002))
    const resB = await app.request(postBook(USER_B, 5002))
    expect(resA.status).toBe(201)
    expect(resB.status).toBe(201)

    // Both users are members of the SAME single shared book; no ingestion enqueued.
    const bookRows = await pg.db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.gutendexId, 5002))
    expect(bookRows.length).toBe(1)
    expect(bookRows[0]?.id).toBe(sharedId)
    expect(await listCount(app, USER_A)).toBe(1)
    expect(await listCount(app, USER_B)).toBe(1)
    expect(enqueued.length).toBe(0)
  })

  it('concurrent first-add is exactly-once — one shared book, one deterministic ingest key (FR-012)', async () => {
    const [resA, resB] = await Promise.all([
      app.request(postBook(USER_A, GUTENDEX_996)),
      app.request(postBook(USER_B, GUTENDEX_996)),
    ])
    expect(resA.status).toBe(201)
    expect(resB.status).toBe(201)

    const dataA = ((await resA.json()) as { data: { id: string } }).data
    const dataB = ((await resB.json()) as { data: { id: string } }).data
    expect(dataA.id).toBe(dataB.id)

    // Exactly one shared book row for gutendex 996, both users members.
    const bookRows = await pg.db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.gutendexId, GUTENDEX_996))
    expect(bookRows.length).toBe(1)
    expect(await listCount(app, USER_A)).toBe(1)
    expect(await listCount(app, USER_B)).toBe(1)

    // Every ingest enqueue used the same deterministic singleton key, so a
    // singleton-aware queue (pg-boss) collapses them to exactly one job.
    const keys = new Set(enqueued.map((e) => e.singletonKey))
    expect(keys.size).toBe(1)
    expect([...keys][0]).toBe(`ingest-${dataA.id}`)
  })

  it('enforces the per-user ingestion concurrency cap (429) without affecting other users (FR-021)', async () => {
    // A is already at the cap: CONCURRENCY_LIMIT books actively ingesting.
    for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
      const id = await insertBookWithStatus(pg.db, 6000 + i, 'downloading')
      await addLibraryMembership(pg.db, USER_A, id)
    }

    // A adds a new discovered title → auto-ingest trips the cap → 429.
    const resA = await app.request(postBook(USER_A, GUTENDEX_996))
    const bodyA = (await resA.json()) as Record<string, unknown>
    expect(resA.status).toBe(429)
    expect(bodyA.type).toBe(`${PROBLEM_TYPE_PREFIX}ingestion-concurrency-limit`)
    expect(resA.headers.get('retry-after')).toBe('60')

    // B has zero in-flight ingestions: the per-user cap does not block them.
    const bId = await insertBookWithStatus(pg.db, 6100, 'discovered')
    await addLibraryMembership(pg.db, USER_B, bId)
    const resB = await app.request(
      asUser(USER_B, `/api/library/books/${bId}/ingest`, { method: 'POST' }),
    )
    expect(resB.status).toBe(202)
  })
})
