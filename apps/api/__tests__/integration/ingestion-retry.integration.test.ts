import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from '@dialogus/db'
import { books, chunks } from '@dialogus/db/schema'
import type { EmbeddingProvider } from '@dialogus/ingestion'
import { EmbedError } from '@dialogus/ingestion/domain/ingestion/IngestionError'
import { MockEmbeddingProvider } from '@dialogus/ingestion/infrastructure/external/MockEmbeddingProvider'
import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HttpResponse, http } from 'msw'
import { type SetupServer, setupServer } from 'msw/node'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createProblemMiddleware,
  type ProblemVariables,
} from '../../src/infrastructure/http/middleware/problem'
import { createLibraryRoute } from '../../src/infrastructure/http/routes/library'
import {
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
import { generateLargeBook } from './fixtures/generate-large-book'

const GUTENDEX_ID = 200042
const TXT_URL = `https://aleph.gutenberg.org/cache/epub/${GUTENDEX_ID}/pg${GUTENDEX_ID}.txt.utf8`

class FailOnceEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1536 as const
  readonly modelName = 'mock-fail-once-1536'
  readonly callBatchSizes: number[] = []
  hasFailed = false
  private readonly delegate = new MockEmbeddingProvider()

  async embed(texts: readonly string[]): Promise<number[][]> {
    this.callBatchSizes.push(texts.length)
    if (!this.hasFailed && this.callBatchSizes.length === 2) {
      this.hasFailed = true
      throw new EmbedError('Simulated transient embed failure', { retryable: true })
    }
    return this.delegate.embed(texts)
  }
}

describe.skipIf(!dockerAvailable)('ingestion retry — recover from mid-embed failure', () => {
  let pg: PostgresContext
  let worker: StartedWorker
  let server: SetupServer
  let storageRoot: string
  let downloadCount: number
  let provider: FailOnceEmbeddingProvider
  let httpApp: Hono<{ Variables: ProblemVariables }>

  beforeAll(async () => {
    pg = await startPostgres()
    storageRoot = await mkdtemp(join(tmpdir(), 'ingestion-retry-'))
    provider = new FailOnceEmbeddingProvider()

    const fixture = generateLargeBook({
      approximateWordCount: 130_000,
      chapterCount: 2,
      seed: 42,
      wordsPerParagraph: 40,
    })

    downloadCount = 0
    server = setupServer(
      http.get(TXT_URL, async () => {
        downloadCount += 1
        return HttpResponse.text(fixture.text, {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      }),
    )
    server.listen({ onUnhandledRequest: 'bypass' })

    worker = await startTestWorker({
      databaseUrl: pg.databaseUrl,
      storageRoot,
      logger: pino({ level: 'silent' }),
      embeddingProvider: provider,
    })

    const logger = pino({ level: 'silent' })
    httpApp = new Hono<{ Variables: ProblemVariables }>()
    httpApp.use('*', createProblemMiddleware({ logger }))
    httpApp.route(
      '/api/library',
      createLibraryRoute({
        db: pg.db,
        logger,
        enqueueDeps: { databaseUrl: pg.databaseUrl },
      }),
    )

    expect(fixture.byteLength).toBeGreaterThan(50_000)
  }, 240_000)

  afterAll(async () => {
    if (worker) await stopTestWorker(worker)
    if (server) server.close()
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true }).catch(() => {})
    if (pg) await stopPostgres(pg)
  })

  it('fails mid-embed, then retries to ready without re-downloading or re-embedding', async () => {
    const bookId = await insertDiscoveredBook(pg.db, {
      gutendexId: GUTENDEX_ID,
      title: 'Synthetic Retry Book',
      languages: ['en'],
      downloadUrlTxt: TXT_URL,
    })

    await worker.boot.boss.send('ingestion.download', { bookId })

    await waitForBookStatus(pg.db, bookId, 'failed', 90_000)

    const failed = await pg.db.query.books.findFirst({ where: eq(books.id, bookId) })
    expect(failed?.ingestionStatus).toBe('failed')
    expect(failed?.ingestionLastStage).toBe('embed')
    expect(failed?.ingestionError ?? '').toMatch(/^ingestion-embed-failed:/)

    const totalChunks = await countChunks(pg.db, bookId)
    expect(totalChunks).toBeGreaterThan(100)

    const embeddedAfterFail = await countEmbedded(pg.db, bookId)
    const pendingAfterFail = totalChunks - embeddedAfterFail
    expect(embeddedAfterFail).toBe(100)
    expect(pendingAfterFail).toBeGreaterThan(0)

    const callsBeforeRetry = provider.callBatchSizes.length
    expect(callsBeforeRetry).toBe(2)

    const retryResponse = await httpApp.request(
      new Request(`http://local/api/library/books/${bookId}/ingest/retry`, {
        method: 'POST',
        headers: { 'Idempotency-Key': 'retry-1' },
      }),
    )
    expect(retryResponse.status).toBe(202)
    const retryBody = (await retryResponse.json()) as { data: { stage: string; job_id: string } }
    expect(retryBody.data.stage).toBe('embed')
    expect(retryBody.data.job_id).toBeTruthy()

    await waitForBookStatus(pg.db, bookId, 'ready', 90_000, { allowFailed: true })

    const ready = await pg.db.query.books.findFirst({ where: eq(books.id, bookId) })
    expect(ready?.ingestionStatus).toBe('ready')
    expect(ready?.ingestionProgress).toBe(100)

    const embeddedAfterReady = await countEmbedded(pg.db, bookId)
    expect(embeddedAfterReady).toBe(totalChunks)

    expect(downloadCount).toBe(1)

    const retryCalls = provider.callBatchSizes.slice(callsBeforeRetry)
    const retryEmbeddedTexts = retryCalls.reduce((sum, n) => sum + n, 0)
    expect(retryEmbeddedTexts).toBe(pendingAfterFail)
    for (const size of retryCalls) {
      expect(size).toBeLessThanOrEqual(100)
    }
  })
})

async function countChunks(db: Database, bookId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chunks)
    .where(eq(chunks.bookId, bookId))
  return row?.count ?? 0
}

async function countEmbedded(db: Database, bookId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chunks)
    .where(sql`${chunks.bookId} = ${bookId} AND ${chunks.embedding} IS NOT NULL`)
  return row?.count ?? 0
}
