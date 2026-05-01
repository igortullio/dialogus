import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { books, chapterSummaries, chapters, chunks } from '@dialogus/db/schema'
import { eq, isNull, sql } from 'drizzle-orm'
import { HttpResponse, http } from 'msw'
import { type SetupServer, setupServer } from 'msw/node'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

const FIXTURE_EPUB_PATH = new URL(
  '../../../../packages/ingestion/__fixtures__/epub/sample-en.epub',
  import.meta.url,
)

const GUTENDEX_ID = 100015
const EPUB_URL = `https://www.gutenberg.org/cache/epub/${GUTENDEX_ID}/pg${GUTENDEX_ID}.epub`

describe.skipIf(!dockerAvailable)('ingestion happy path — full 7-stage pipeline', () => {
  let pg: PostgresContext
  let worker: StartedWorker
  let server: SetupServer
  let storageRoot: string
  let downloadCount: number

  beforeAll(async () => {
    pg = await startPostgres()
    storageRoot = await mkdtemp(join(tmpdir(), 'ingestion-happy-'))

    downloadCount = 0
    server = setupServer(
      http.get(EPUB_URL, async () => {
        downloadCount += 1
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
  }, 240_000)

  afterAll(async () => {
    if (worker) await stopTestWorker(worker)
    if (server) server.close()
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true }).catch(() => {})
    if (pg) await stopPostgres(pg)
  })

  it('runs download → clean → parse → chunk → summarize → embed → index to ready', async () => {
    const bookId = await insertDiscoveredBook(pg.db, {
      gutendexId: GUTENDEX_ID,
      title: 'Moby-Dick (excerpt)',
      authorName: 'Herman Melville',
      languages: ['en'],
      downloadUrlEpub: EPUB_URL,
    })

    await worker.boot.boss.send('ingestion.download', { bookId })

    await waitForBookStatus(pg.db, bookId, 'ready', 60_000)

    const book = await pg.db.query.books.findFirst({ where: eq(books.id, bookId) })
    expect(book?.ingestionStatus).toBe('ready')
    expect(book?.indexedAt).toBeInstanceOf(Date)
    expect(book?.ingestionProgress).toBe(100)
    expect(book?.rawHash).toBeTruthy()

    const chapterRows = await pg.db.select().from(chapters).where(eq(chapters.bookId, bookId))
    expect(chapterRows.length).toBeGreaterThan(0)

    const summaryRows = await pg.db
      .select()
      .from(chapterSummaries)
      .where(eq(chapterSummaries.bookId, bookId))
    expect(summaryRows.length).toBe(chapterRows.length)
    for (const row of summaryRows) {
      expect(row.summary.length).toBeGreaterThan(0)
      expect(row.model).toBe('mock-summary-generator')
    }

    const chunkRows = await pg.db.select().from(chunks).where(eq(chunks.bookId, bookId))
    expect(chunkRows.length).toBeGreaterThan(0)
    for (const chunk of chunkRows) {
      expect(chunk.embedding).not.toBeNull()
    }

    const [pending] = await pg.db
      .select({ count: sql<number>`count(*)::int` })
      .from(chunks)
      .where(isNull(chunks.embedding))
    expect(pending?.count).toBe(0)

    expect(downloadCount).toBe(1)
  })
})
