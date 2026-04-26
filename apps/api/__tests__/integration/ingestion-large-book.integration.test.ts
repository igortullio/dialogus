import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { books, chapters, chunks } from '@dialogus/db/schema'
import { eq, sql } from 'drizzle-orm'
import { HttpResponse, http } from 'msw'
import { type SetupServer, setupServer } from 'msw/node'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  captureMemory,
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

const GUTENDEX_ID = 300077
const TXT_URL = `https://aleph.gutenberg.org/cache/epub/${GUTENDEX_ID}/pg${GUTENDEX_ID}.txt.utf8`

/**
 * ADR-004 streaming discipline: the synthetic 400k-token book inflates to ~3 MB of
 * raw UTF-8 text, ~3 MB of stored chapter rows, ~1.7 MB of stored chunk rows, and
 * ~9 MB worth of mock 1536-d float embeddings if everything hit memory at once. The
 * pipeline must never accumulate the full book — only the active batch (≤100 chunks)
 * and a single chapter at a time. We verify that by capturing the heap delta from
 * pre-pipeline baseline to peak: if streaming holds, the delta stays well under
 * MAX_HEAP_DELTA_MB. Total V8 baseline is ignored because vitest + testcontainers
 * baseline is platform-dependent and unrelated to the pipeline's working set.
 */
const MAX_HEAP_DELTA_MB = 150

describe.skipIf(!dockerAvailable)(
  'ingestion large book — 400k-token synthetic fixture, ADR-004 streaming discipline',
  () => {
    let pg: PostgresContext
    let worker: StartedWorker
    let server: SetupServer
    let storageRoot: string

    beforeAll(async () => {
      pg = await startPostgres()
      storageRoot = await mkdtemp(join(tmpdir(), 'ingestion-large-'))

      const fixture = generateLargeBook({
        approximateWordCount: 420_000,
        chapterCount: 50,
        seed: 99,
        wordsPerParagraph: 60,
      })
      expect(fixture.chapterCount).toBeGreaterThanOrEqual(50)
      expect(fixture.wordCount).toBeGreaterThanOrEqual(400_000)

      server = setupServer(
        http.get(TXT_URL, async () =>
          HttpResponse.text(fixture.text, {
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          }),
        ),
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

    it('completes the full pipeline to ready under tight peak-heap discipline', async () => {
      const bookId = await insertDiscoveredBook(pg.db, {
        gutendexId: GUTENDEX_ID,
        title: 'Synthetic 400k-token book',
        languages: ['en'],
        downloadUrlTxt: TXT_URL,
      })

      if (typeof globalThis.gc === 'function') {
        globalThis.gc()
      }
      const baselineHeapMB = captureMemory().heapUsedMB
      let peakHeapMB = baselineHeapMB
      const monitor = setInterval(() => {
        const m = captureMemory()
        if (m.heapUsedMB > peakHeapMB) peakHeapMB = m.heapUsedMB
      }, 250).unref()

      try {
        await worker.boot.boss.send('ingestion.download', { bookId })
        await waitForBookStatus(pg.db, bookId, 'ready', 150_000)
      } finally {
        clearInterval(monitor)
      }

      const ready = await pg.db.query.books.findFirst({ where: eq(books.id, bookId) })
      expect(ready?.ingestionStatus).toBe('ready')
      expect(ready?.ingestionProgress).toBe(100)
      expect(ready?.indexedAt).toBeInstanceOf(Date)

      const [chapterCount] = await pg.db
        .select({ count: sql<number>`count(*)::int` })
        .from(chapters)
        .where(eq(chapters.bookId, bookId))
      expect(chapterCount?.count ?? 0).toBeGreaterThanOrEqual(50)

      const [chunkCount] = await pg.db
        .select({ count: sql<number>`count(*)::int` })
        .from(chunks)
        .where(eq(chunks.bookId, bookId))
      expect(chunkCount?.count ?? 0).toBeGreaterThan(400)

      const [pendingEmbeddings] = await pg.db
        .select({ count: sql<number>`count(*)::int` })
        .from(chunks)
        .where(sql`${chunks.bookId} = ${bookId} AND ${chunks.embedding} IS NULL`)
      expect(pendingEmbeddings?.count).toBe(0)

      const heapDeltaMB = peakHeapMB - baselineHeapMB
      expect(heapDeltaMB).toBeLessThan(MAX_HEAP_DELTA_MB)
    })
  },
)
