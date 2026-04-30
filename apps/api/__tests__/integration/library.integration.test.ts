import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addBookToLibrary, getBook, listLibrary, removeBook, restoreBook } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { createDatabase } from '@dialogus/db'
import { books, idempotencyKeys } from '@dialogus/db/schema'
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
import {
  createProblemMiddleware,
  type ProblemVariables,
} from '../../src/infrastructure/http/middleware/problem'
import { createLibraryRoute } from '../../src/infrastructure/http/routes/library'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../../../../packages/db/drizzle')

const dockerAvailable = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}']).status === 0

const server = setupServer(...happyPathHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function buildApp(db: Database): Hono<{ Variables: ProblemVariables }> {
  const bookRepository = new DrizzleBookRepository(db)
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
      enqueueDeps: { databaseUrl: 'postgres://test' },
      addBookToLibrary: (gutendexId) =>
        addBookToLibrary({ repository: bookRepository, client: gutendexClient }, gutendexId),
      listLibrary: (input) => listLibrary({ repository: bookRepository }, input),
      getBook: (id) => getBook({ repository: bookRepository }, id),
      removeBook: (id) => removeBook({ repository: bookRepository }, id),
      restoreBook: (id) => restoreBook({ repository: bookRepository }, id),
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

    it('full CRUD sequence: POST → GET list → GET :id → DELETE → GET list excludes → GET list include_deleted → POST restore → GET list active', async () => {
      // POST — add book
      const postRes = await app.request(postBook(996))
      const postBody = (await postRes.json()) as Record<string, unknown>
      expect(postRes.status).toBe(201)
      const data = postBody.data as Record<string, unknown>
      expect(data?.gutendex_id).toBe(996)
      expect(data?.ingestion_status).toBe('discovered')
      const bookId = data?.id as string
      expect(typeof bookId).toBe('string')

      // GET list — 1 active book
      const listRes = await app.request('/api/library/books')
      const listBody = (await listRes.json()) as Record<string, unknown>
      expect(listRes.status).toBe(200)
      expect((listBody.data as unknown[]).length).toBe(1)
      expect((listBody.meta as Record<string, unknown>)?.count).toBe(1)

      // GET :id — 200
      const getRes = await app.request(`/api/library/books/${bookId}`)
      const getBody = (await getRes.json()) as Record<string, unknown>
      expect(getRes.status).toBe(200)
      expect((getBody.data as Record<string, unknown>)?.id).toBe(bookId)

      // DELETE — soft delete
      const delRes = await app.request(`/api/library/books/${bookId}`, { method: 'DELETE' })
      expect(delRes.status).toBe(204)

      // GET list active — 0 items
      const listAfterDeleteRes = await app.request('/api/library/books')
      const listAfterDeleteBody = (await listAfterDeleteRes.json()) as Record<string, unknown>
      expect(listAfterDeleteRes.status).toBe(200)
      expect((listAfterDeleteBody.data as unknown[]).length).toBe(0)
      expect((listAfterDeleteBody.meta as Record<string, unknown>)?.count).toBe(0)

      // GET :id still returns with deleted_at populated
      const getDeletedRes = await app.request(`/api/library/books/${bookId}`)
      const getDeletedBody = (await getDeletedRes.json()) as Record<string, unknown>
      expect(getDeletedRes.status).toBe(200)
      const deletedData = getDeletedBody.data as Record<string, unknown>
      expect(typeof deletedData?.deleted_at).toBe('string')

      // GET list with include_deleted=true — 1 book with deleted_at
      const listIncDeletedRes = await app.request('/api/library/books?include_deleted=true')
      const listIncDeletedBody = (await listIncDeletedRes.json()) as Record<string, unknown>
      expect(listIncDeletedRes.status).toBe(200)
      const incDeletedItems = listIncDeletedBody.data as Array<Record<string, unknown>>
      expect(incDeletedItems.length).toBe(1)
      expect(typeof incDeletedItems[0]?.deleted_at).toBe('string')

      // POST /restore
      const restoreRes = await app.request(`/api/library/books/${bookId}/restore`, {
        method: 'POST',
      })
      const restoreBody = (await restoreRes.json()) as Record<string, unknown>
      expect(restoreRes.status).toBe(200)
      const restoredData = restoreBody.data as Record<string, unknown>
      expect(restoredData?.deleted_at).toBeNull()

      // GET list active — 1 active book again
      const listFinalRes = await app.request('/api/library/books')
      const listFinalBody = (await listFinalRes.json()) as Record<string, unknown>
      expect(listFinalRes.status).toBe(200)
      expect((listFinalBody.data as unknown[]).length).toBe(1)
      expect((listFinalBody.meta as Record<string, unknown>)?.count).toBe(1)
    })

    it('returns 409 duplicate-gutendex-id when posting the same gutendex_id twice without Idempotency-Key', async () => {
      const first = await app.request(postBook(996))
      expect(first.status).toBe(201)

      const second = await app.request(postBook(996))
      const body = (await second.json()) as Record<string, unknown>

      expect(second.status).toBe(409)
      expect(second.headers.get('content-type')).toBe('application/problem+json')
      expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}duplicate-gutendex-id`)
      expect(body.status).toBe(409)
      expect(typeof body.existing_book_id).toBe('string')
    })

    it('returns 200 envelope with books filtered by status=discovered', async () => {
      await app.request(postBook(996))

      const res = await app.request('/api/library/books?status=discovered')
      const body = (await res.json()) as Record<string, unknown>

      expect(res.status).toBe(200)
      const items = body.data as Array<Record<string, unknown>>
      expect(items.length).toBe(1)
      expect(items[0]?.ingestion_status).toBe('discovered')

      const noneRes = await app.request('/api/library/books?status=ready')
      const noneBody = (await noneRes.json()) as Record<string, unknown>
      expect((noneBody.data as unknown[]).length).toBe(0)
    })

    it('returns 404 book-not-found for unknown id on GET :id', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000099'
      const res = await app.request(`/api/library/books/${fakeId}`)
      const body = (await res.json()) as Record<string, unknown>

      expect(res.status).toBe(404)
      expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}book-not-found`)
    })
  },
)
