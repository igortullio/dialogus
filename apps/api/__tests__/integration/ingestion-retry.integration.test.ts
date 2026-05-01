import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from '@dialogus/db'
import { books, chapterSummaries, chunks } from '@dialogus/db/schema'
import type { ChapterSummaryGeneration, ChapterSummaryGenerator } from '@dialogus/ingestion'
import { SummarizeError } from '@dialogus/ingestion/domain/ingestion/IngestionError'
import type {
  ParsedChapter,
  SupportedLanguage,
} from '@dialogus/ingestion/domain/parser/ChapterParser.port'
import { MockChapterSummaryGenerator } from '@dialogus/ingestion/infrastructure/external/MockChapterSummaryGenerator'
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
const TXT_URL = `https://www.gutenberg.org/cache/epub/${GUTENDEX_ID}/pg${GUTENDEX_ID}.txt`

class FailOnceSummaryGenerator implements ChapterSummaryGenerator {
  readonly callOrdinals: number[] = []
  hasFailed = false
  private readonly delegate = new MockChapterSummaryGenerator()
  constructor(private readonly failOnOrdinal: number) {}

  async generate(
    chapter: ParsedChapter,
    language: SupportedLanguage,
  ): Promise<ChapterSummaryGeneration> {
    this.callOrdinals.push(chapter.ordinal)
    if (!this.hasFailed && chapter.ordinal === this.failOnOrdinal) {
      this.hasFailed = true
      throw new SummarizeError('Simulated transient summarize failure', { retryable: true })
    }
    return this.delegate.generate(chapter, language)
  }
}

describe.skipIf(!dockerAvailable)('ingestion retry — recover from mid-summarize failure', () => {
  let pg: PostgresContext
  let worker: StartedWorker
  let server: SetupServer
  let storageRoot: string
  let downloadCount: number
  let generator: FailOnceSummaryGenerator
  let httpApp: Hono<{ Variables: ProblemVariables }>

  beforeAll(async () => {
    pg = await startPostgres()
    storageRoot = await mkdtemp(join(tmpdir(), 'ingestion-retry-'))
    generator = new FailOnceSummaryGenerator(3)

    const fixture = generateLargeBook({
      approximateWordCount: 25_000,
      chapterCount: 5,
      seed: 17,
      wordsPerParagraph: 30,
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
      chapterSummaryGenerator: generator,
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

    expect(fixture.byteLength).toBeGreaterThan(10_000)
  }, 240_000)

  afterAll(async () => {
    if (worker) await stopTestWorker(worker)
    if (server) server.close()
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true }).catch(() => {})
    if (pg) await stopPostgres(pg)
  })

  it('fails mid-summarize, then retries to ready without re-downloading or re-summarizing', async () => {
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
    expect(failed?.ingestionLastStage).toBe('summarize')
    expect(failed?.ingestionError ?? '').toMatch(/^ingestion-summarize-failed:/)

    const summariesBeforeRetry = await countSummaries(pg.db, bookId)
    expect(summariesBeforeRetry).toBe(2)

    const callOrdinalsBeforeRetry = [...generator.callOrdinals]
    expect(callOrdinalsBeforeRetry).toEqual([1, 2, 3])

    const embeddedBeforeRetry = await countEmbedded(pg.db, bookId)
    expect(embeddedBeforeRetry).toBe(0)

    const retryResponse = await httpApp.request(
      new Request(`http://local/api/library/books/${bookId}/ingest/retry`, {
        method: 'POST',
        headers: { 'Idempotency-Key': 'retry-summarize-1' },
      }),
    )
    expect(retryResponse.status).toBe(202)
    const retryBody = (await retryResponse.json()) as { data: { stage: string; job_id: string } }
    expect(retryBody.data.stage).toBe('summarize')
    expect(retryBody.data.job_id).toBeTruthy()

    await waitForBookStatus(pg.db, bookId, 'ready', 90_000, { allowFailed: true })

    const ready = await pg.db.query.books.findFirst({ where: eq(books.id, bookId) })
    expect(ready?.ingestionStatus).toBe('ready')
    expect(ready?.ingestionProgress).toBe(100)

    const summariesAfterReady = await countSummaries(pg.db, bookId)
    expect(summariesAfterReady).toBe(5)

    const totalChunks = await countChunks(pg.db, bookId)
    expect(totalChunks).toBeGreaterThan(0)
    const embeddedAfterReady = await countEmbedded(pg.db, bookId)
    expect(embeddedAfterReady).toBe(totalChunks)

    expect(downloadCount).toBe(1)

    const retryCallOrdinals = generator.callOrdinals.slice(callOrdinalsBeforeRetry.length)
    expect(retryCallOrdinals).toEqual([3, 4, 5])
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

async function countSummaries(db: Database, bookId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chapterSummaries)
    .where(eq(chapterSummaries.bookId, bookId))
  return row?.count ?? 0
}
