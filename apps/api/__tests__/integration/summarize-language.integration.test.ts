import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { books, chapterSummaries } from '@dialogus/db/schema'
import { eq } from 'drizzle-orm'
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

const FIXTURE_EN_EPUB = new URL(
  '../../../../packages/ingestion/__fixtures__/epub/sample-en.epub',
  import.meta.url,
)
const FIXTURE_PT_EPUB = new URL(
  '../../../../packages/ingestion/__fixtures__/epub/sample-pt.epub',
  import.meta.url,
)

const EN_GUTENDEX_ID = 800001
const PT_GUTENDEX_ID = 800002
const EN_EPUB_URL = `https://aleph.gutenberg.org/cache/epub/${EN_GUTENDEX_ID}/pg${EN_GUTENDEX_ID}.epub.noimages`
const PT_EPUB_URL = `https://aleph.gutenberg.org/cache/epub/${PT_GUTENDEX_ID}/pg${PT_GUTENDEX_ID}.epub.noimages`

describe.skipIf(!dockerAvailable)(
  'summarize stage — language flows from books.languages[0] to generator',
  () => {
    let pg: PostgresContext
    let worker: StartedWorker
    let server: SetupServer
    let storageRoot: string

    beforeAll(async () => {
      pg = await startPostgres()
      storageRoot = await mkdtemp(join(tmpdir(), 'summarize-lang-'))

      server = setupServer(
        http.get(EN_EPUB_URL, async () => {
          const body = await readFile(FIXTURE_EN_EPUB)
          return new HttpResponse(body, {
            headers: { 'content-type': 'application/epub+zip' },
          })
        }),
        http.get(PT_EPUB_URL, async () => {
          const body = await readFile(FIXTURE_PT_EPUB)
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

    it('summarizes EN + PT books with language-consistent markers in every summary', async () => {
      const enBookId = await insertDiscoveredBook(pg.db, {
        gutendexId: EN_GUTENDEX_ID,
        title: 'Sample EN Book',
        languages: ['en'],
        downloadUrlEpub: EN_EPUB_URL,
      })
      const ptBookId = await insertDiscoveredBook(pg.db, {
        gutendexId: PT_GUTENDEX_ID,
        title: 'Livro de exemplo PT',
        languages: ['pt'],
        downloadUrlEpub: PT_EPUB_URL,
      })

      await worker.boot.boss.send('ingestion.download', { bookId: enBookId })
      await waitForBookStatus(pg.db, enBookId, 'ready', 90_000)

      await worker.boot.boss.send('ingestion.download', { bookId: ptBookId })
      await waitForBookStatus(pg.db, ptBookId, 'ready', 90_000)

      const enBook = await pg.db.query.books.findFirst({ where: eq(books.id, enBookId) })
      const ptBook = await pg.db.query.books.findFirst({ where: eq(books.id, ptBookId) })
      expect(enBook?.ingestionStatus).toBe('ready')
      expect(ptBook?.ingestionStatus).toBe('ready')

      const enSummaries = await pg.db
        .select()
        .from(chapterSummaries)
        .where(eq(chapterSummaries.bookId, enBookId))
      const ptSummaries = await pg.db
        .select()
        .from(chapterSummaries)
        .where(eq(chapterSummaries.bookId, ptBookId))

      expect(enSummaries.length).toBeGreaterThan(0)
      expect(ptSummaries.length).toBeGreaterThan(0)

      const enLanguageHits = enSummaries.filter((row) => row.summary.includes('[lang=en]')).length
      const ptLanguageHits = ptSummaries.filter((row) => row.summary.includes('[lang=pt]')).length

      const enRatio = enLanguageHits / enSummaries.length
      const ptRatio = ptLanguageHits / ptSummaries.length

      expect(enRatio).toBeGreaterThanOrEqual(0.8)
      expect(ptRatio).toBeGreaterThanOrEqual(0.8)

      for (const row of enSummaries) {
        expect(row.summary).not.toContain('[lang=pt]')
      }
      for (const row of ptSummaries) {
        expect(row.summary).not.toContain('[lang=en]')
      }
    })
  },
)
