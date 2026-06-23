import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addBookToLibrary, getBook, listLibrary, removeBook, restoreBook } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { createDatabase } from '@dialogus/db'
import { books, idempotencyKeys, libraryEntries, user } from '@dialogus/db/schema'
import { PROBLEM_TYPE_PREFIX } from '@dialogus/shared/http/problem'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
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
import { fakeAuth } from '../_helpers/auth'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../../../../packages/db/drizzle')

const dockerAvailable = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}']).status === 0

const USER_ID = 'user-lib-int'

const server = setupServer(...happyPathHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function buildApp(db: Database): Hono<{ Variables: ProblemVariables }> {
  const bookRepository = new DrizzleBookRepository(db)
  const libraryRepo = new DrizzleLibraryEntryRepository(db)
  const gutendexClient = new GutendexHttpClient({
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
      auth: fakeAuth(USER_ID),
      libraryRepo,
      concurrencyLimit: 100,
      enqueueDeps: { databaseUrl: 'postgres://test' },
      // Stub the queue so the POST /books auto-ingest doesn't reach real pg-boss.
      enqueueImpl: async () => 'job-test',
      addBookToLibrary: (userId, gutendexId) =>
        addBookToLibrary(
          { repository: bookRepository, libraryRepo, client: gutendexClient },
          userId,
          gutendexId,
        ),
      listLibrary: (userId, input) => listLibrary({ libraryRepo }, userId, input),
      getBook: (userId, id) => getBook({ repository: bookRepository, libraryRepo }, userId, id),
      removeBook: (userId, id) => removeBook({ libraryRepo }, userId, id),
      restoreBook: (userId, id) =>
        restoreBook({ repository: bookRepository, libraryRepo }, userId, id),
    }),
  )
  return app
}

describe.skipIf(!dockerAvailable)(
  'Library CRUD routes — full sequence (Testcontainers + MSW)',
  () => {
    let container: StartedPostgreSqlContainer
    let db: Database
    let app: Hono<{ Variables: ProblemVariables }>

    beforeAll(async () => {
      container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
        .withDatabase('test')
        .withUsername('test')
        .withPassword('test')
        .start()
      db = createDatabase(container.getConnectionUri())
      await migrate(db, { migrationsFolder })
      await db.insert(user).values({
        id: USER_ID,
        name: 'Library Integration User',
        email: 'lib-int@test.local',
        emailVerified: true,
        role: 'member',
      })
      app = buildApp(db)
    }, 180_000)

    afterAll(async () => {
      const client = (
        db as unknown as { $client?: { end: (opts?: { timeout?: number }) => Promise<void> } }
      ).$client
      if (client) await client.end({ timeout: 5 })
      if (container) await container.stop()
    })

    beforeEach(async () => {
      await db.delete(idempotencyKeys)
      await db.delete(libraryEntries)
      await db.delete(books)
    })

    function postBook(gutendexId: number, key?: string): Request {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (key) headers['Idempotency-Key'] = key
      return new Request('http://local/api/library/books', {
        method: 'POST',
        headers,
        body: JSON.stringify({ gutendex_id: gutendexId }),
      })
    }

    it('full membership lifecycle: POST → list → get → DELETE (member-gated 404) → include_deleted → restore', async () => {
      // POST — add book; the response reflects the freshly-resolved (discovered) book.
      const postRes = await app.request(postBook(996))
      const postBody = (await postRes.json()) as Record<string, unknown>
      expect(postRes.status).toBe(201)
      const data = postBody.data as Record<string, unknown>
      expect(data?.gutendex_id).toBe(996)
      expect(data?.ingestion_status).toBe('discovered')
      const bookId = data?.id as string
      expect(typeof bookId).toBe('string')

      // GET list — 1 active membership.
      const listRes = await app.request('/api/library/books')
      const listBody = (await listRes.json()) as Record<string, unknown>
      expect(listRes.status).toBe(200)
      expect((listBody.data as unknown[]).length).toBe(1)
      expect((listBody.meta as Record<string, unknown>)?.count).toBe(1)

      // GET :id — 200 for a member.
      const getRes = await app.request(`/api/library/books/${bookId}`)
      expect(getRes.status).toBe(200)
      expect(((await getRes.json()) as { data: Record<string, unknown> }).data?.id).toBe(bookId)

      // DELETE — soft-remove the membership only.
      const delRes = await app.request(`/api/library/books/${bookId}`, { method: 'DELETE' })
      expect(delRes.status).toBe(204)

      // GET list active — 0 items.
      const listAfterDeleteRes = await app.request('/api/library/books')
      const listAfterDeleteBody = (await listAfterDeleteRes.json()) as Record<string, unknown>
      expect((listAfterDeleteBody.data as unknown[]).length).toBe(0)

      // GET :id now 404 — a removed membership must not leak the shared book (SC-002).
      const getDeletedRes = await app.request(`/api/library/books/${bookId}`)
      const getDeletedBody = (await getDeletedRes.json()) as Record<string, unknown>
      expect(getDeletedRes.status).toBe(404)
      expect(getDeletedBody.type).toBe(`${PROBLEM_TYPE_PREFIX}book-not-found`)

      // include_deleted=true surfaces the removed membership's book; the shared
      // book row itself is never soft-deleted (deleted_at stays null — FR-013).
      const listIncDeletedRes = await app.request('/api/library/books?include_deleted=true')
      const listIncDeletedBody = (await listIncDeletedRes.json()) as Record<string, unknown>
      const incDeletedItems = listIncDeletedBody.data as Array<Record<string, unknown>>
      expect(incDeletedItems.length).toBe(1)
      expect(incDeletedItems[0]?.id).toBe(bookId)
      expect(incDeletedItems[0]?.deleted_at).toBeNull()

      // POST /restore — re-activate the membership.
      const restoreRes = await app.request(`/api/library/books/${bookId}/restore`, {
        method: 'POST',
      })
      const restoreBody = (await restoreRes.json()) as Record<string, unknown>
      expect(restoreRes.status).toBe(200)
      expect((restoreBody.data as Record<string, unknown>)?.deleted_at).toBeNull()

      // GET list active — 1 again.
      const listFinalRes = await app.request('/api/library/books')
      const listFinalBody = (await listFinalRes.json()) as Record<string, unknown>
      expect((listFinalBody.data as unknown[]).length).toBe(1)
    })

    it('re-adding the same gutendex_id is idempotent (no duplicate error)', async () => {
      const first = await app.request(postBook(996))
      const firstBody = (await first.json()) as { data: Record<string, unknown> }
      expect(first.status).toBe(201)
      const bookId = firstBody.data?.id as string

      const second = await app.request(postBook(996))
      const secondBody = (await second.json()) as { data: Record<string, unknown> }
      expect(second.status).toBe(201)
      // Same shared book, single membership — the list stays at one entry.
      expect(secondBody.data?.id).toBe(bookId)

      const listRes = await app.request('/api/library/books')
      const listBody = (await listRes.json()) as Record<string, unknown>
      expect((listBody.data as unknown[]).length).toBe(1)
    })

    it('filters the list by ingestion status', async () => {
      // The book auto-ingests on add, flipping to "downloading".
      await app.request(postBook(996))

      const downloadingRes = await app.request('/api/library/books?status=downloading')
      const downloadingBody = (await downloadingRes.json()) as Record<string, unknown>
      expect(downloadingRes.status).toBe(200)
      expect((downloadingBody.data as unknown[]).length).toBe(1)

      const readyRes = await app.request('/api/library/books?status=ready')
      const readyBody = (await readyRes.json()) as Record<string, unknown>
      expect((readyBody.data as unknown[]).length).toBe(0)
    })

    it('returns 404 book-not-found for a non-member id on GET :id', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000099'
      const res = await app.request(`/api/library/books/${fakeId}`)
      const body = (await res.json()) as Record<string, unknown>

      expect(res.status).toBe(404)
      expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}book-not-found`)
    })

    it('FR-022: a shared book with no membership never surfaces to the user', async () => {
      // A leftover single-user title (or another user's book) exists in the shared
      // corpus with NO library_entries row for this user. No code path lists books
      // globally, so it must be invisible — not in the list (even include_deleted)
      // and book-not-found by id.
      const [row] = await db
        .insert(books)
        .values({
          gutendexId: 765432,
          title: 'Orphaned Title',
          authors: [{ name: 'Nobody', birthYear: null, deathYear: null }],
          languages: ['en'],
          subjects: [],
          ingestionStatus: 'ready',
        })
        .returning({ id: books.id })
      const orphanId = (row as { id: string }).id

      const listRes = await app.request('/api/library/books?include_deleted=true')
      const listBody = (await listRes.json()) as Record<string, unknown>
      expect(listRes.status).toBe(200)
      expect((listBody.data as unknown[]).length).toBe(0)

      const getRes = await app.request(`/api/library/books/${orphanId}`)
      const getBody = (await getRes.json()) as Record<string, unknown>
      expect(getRes.status).toBe(404)
      expect(getBody.type).toBe(`${PROBLEM_TYPE_PREFIX}book-not-found`)
    })
  },
)
