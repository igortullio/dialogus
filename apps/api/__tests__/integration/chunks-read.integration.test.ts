import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chunks } from '@dialogus/db/schema'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { HttpResponse, http } from 'msw'
import { type SetupServer, setupServer } from 'msw/node'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DrizzleLibraryEntryRepository } from '../../../../packages/catalog/src/infrastructure/persistence/DrizzleLibraryEntryRepository'
import {
  createProblemMiddleware,
  type ProblemVariables,
} from '../../src/infrastructure/http/middleware/problem'
import { createLibraryRoute } from '../../src/infrastructure/http/routes/library'
import { fakeAuth } from '../_helpers/auth'
import {
  addLibraryMembership,
  createTestUser,
  dockerAvailable,
  insertDiscoveredBook,
  type PostgresContext,
  type StartedWorker,
  startPostgres,
  startTestWorker,
  stopPostgres,
  stopTestWorker,
  waitForBookStatus,
} from './_helpers/setup'

const FIXTURE_EPUB_PATH = new URL(
  '../../../../packages/ingestion/__fixtures__/epub/sample-en.epub',
  import.meta.url,
)
const GUTENDEX_ID = 400500
const EPUB_URL = `https://www.gutenberg.org/cache/epub/${GUTENDEX_ID}/pg${GUTENDEX_ID}.epub`

describe.skipIf(!dockerAvailable)('GET /api/library/chunks/:id', () => {
  let pg: PostgresContext
  let worker: StartedWorker
  let server: SetupServer
  let storageRoot: string
  let app: Hono<{ Variables: ProblemVariables }>
  let bookId: string
  let firstChunkId: string

  beforeAll(async () => {
    pg = await startPostgres()
    storageRoot = await mkdtemp(join(tmpdir(), 'ingestion-chunks-read-'))

    server = setupServer(
      http.get(EPUB_URL, async () => {
        const body = await readFile(FIXTURE_EPUB_PATH)
        return new HttpResponse(body, {
          headers: { 'content-type': 'application/epub+zip' },
        })
      }),
    )
    server.listen({ onUnhandledRequest: 'bypass' })

    worker = await startTestWorker({
      databaseUrl: pg.databaseUrl,
      storageRoot,
      logger: pino({ level: 'silent' }),
    })

    const userId = await createTestUser(pg.db, { id: 'user-chunks-int' })

    const logger = pino({ level: 'silent' })
    app = new Hono<{ Variables: ProblemVariables }>()
    app.use('*', createProblemMiddleware({ logger }))
    app.route(
      '/api/library',
      createLibraryRoute({
        db: pg.db,
        auth: fakeAuth(userId),
        libraryRepo: new DrizzleLibraryEntryRepository(pg.db),
        concurrencyLimit: 100,
        logger,
        enqueueDeps: { databaseUrl: pg.databaseUrl },
      }),
    )

    bookId = await insertDiscoveredBook(pg.db, {
      gutendexId: GUTENDEX_ID,
      title: 'Moby-Dick (excerpt)',
      authorName: 'Herman Melville',
      languages: ['en'],
      downloadUrlEpub: EPUB_URL,
    })
    // The reader must be an active member to resolve chunks (FR-008 / SC-002).
    await addLibraryMembership(pg.db, userId, bookId)

    await worker.boot.boss.send('ingestion.download', { bookId })
    await waitForBookStatus(pg.db, bookId, 'ready', 90_000)

    const rows = await pg.db.select().from(chunks).where(eq(chunks.bookId, bookId)).limit(1)
    if (!rows[0]) throw new Error('expected at least one chunk after ingestion')
    firstChunkId = rows[0].id
  }, 240_000)

  afterAll(async () => {
    if (worker) await stopTestWorker(worker)
    if (server) server.close()
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true }).catch(() => {})
    if (pg) await stopPostgres(pg)
  })

  it('returns the chunk envelope with chapter metadata for an existing id', async () => {
    const response = await app.request(
      new Request(`http://local/api/library/chunks/${firstChunkId}`, { method: 'GET' }),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      id: firstChunkId,
      book_id: bookId,
    })
    expect(typeof body.data.chapter_id).toBe('string')
    expect(typeof body.data.chapter_title).toBe('string')
    expect(String(body.data.chapter_title).length).toBeGreaterThan(0)
    expect(typeof body.data.chapter_ordinal).toBe('number')
    expect(typeof body.data.text).toBe('string')
    expect(String(body.data.text).length).toBeGreaterThan(0)
    expect(typeof body.data.token_count).toBe('number')
    expect(typeof body.data.start_char).toBe('number')
    expect(typeof body.data.end_char).toBe('number')
  })

  it('returns 404 chunk-not-found for an unknown id', async () => {
    const unknownId = randomUUID()
    const response = await app.request(
      new Request(`http://local/api/library/chunks/${unknownId}`, { method: 'GET' }),
    )
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    const body = (await response.json()) as Record<string, unknown>
    expect(body.type).toBe('urn:dialogus:problems:chunk-not-found')
    expect(body.status).toBe(404)
  })
})
