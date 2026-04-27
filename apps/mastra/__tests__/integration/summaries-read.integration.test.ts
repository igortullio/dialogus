import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DialogusChapterSummaryReadAdapter } from '../../src/persistence/DialogusChapterSummaryReadAdapter'
import {
  clearAllSeededData,
  type PostgresContext,
  seedFixtures,
  startPostgres,
  stopPostgres,
} from './_helpers/seed'

const dockerAvailable = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}']).status === 0

describe.skipIf(!dockerAvailable)(
  'summaries-read integration — DialogusChapterSummaryReadAdapter',
  () => {
    let pg: PostgresContext

    beforeAll(async () => {
      pg = await startPostgres()
    }, 240_000)

    afterAll(async () => {
      if (pg) await stopPostgres(pg)
    })

    afterEach(async () => {
      await clearAllSeededData(pg.db)
    })

    it('returns the full ChapterSummaryView for a seeded chapter id', async () => {
      const seeded = await seedFixtures(pg.db, [
        {
          title: 'Three-Chapter Book',
          chapterCount: 3,
          chunksPerChapter: 1,
          summarize: true,
        },
      ])
      const book = seeded.books[0]
      if (!book) throw new Error('expected one seeded book')

      const adapter = new DialogusChapterSummaryReadAdapter(pg.db)
      const targetChapterId = book.chapterIds[1] as string

      const view = await adapter.findByChapterId(targetChapterId)
      expect(view).not.toBeNull()
      expect(view).toMatchObject({
        bookId: book.bookId,
        chapterId: targetChapterId,
        chapterOrdinal: 2,
        chapterTitle: 'Chapter 2',
        summary: 'Summary of chapter 2.',
        tokenCount: 25,
        model: 'mock-summary-generator',
      })
      expect(view?.generatedAt).toBeInstanceOf(Date)
    })

    it('returns null for an unknown chapter id', async () => {
      await seedFixtures(pg.db, [
        {
          title: 'Single-Chapter Book',
          chapterCount: 1,
          chunksPerChapter: 1,
          summarize: true,
        },
      ])
      const adapter = new DialogusChapterSummaryReadAdapter(pg.db)
      const view = await adapter.findByChapterId(randomUUID())
      expect(view).toBeNull()
    })

    it('seedFixtures helper produces non-empty id arrays and is repeatable on a clean DB', async () => {
      const first = await seedFixtures(pg.db, [
        {
          title: 'Idempotency Book A',
          chapterCount: 2,
          chunksPerChapter: 2,
          summarize: true,
        },
      ])
      const second = await seedFixtures(pg.db, [
        {
          title: 'Idempotency Book B',
          chapterCount: 2,
          chunksPerChapter: 2,
          summarize: true,
        },
      ])
      for (const result of [first, second]) {
        expect(result.books).toHaveLength(1)
        const seededBook = result.books[0]
        if (!seededBook) throw new Error('expected one seeded book')
        expect(seededBook.chapterIds).toHaveLength(2)
        expect(seededBook.chunkIds.flat()).toHaveLength(4)
        expect(seededBook.summaryIds).toHaveLength(2)
      }
      expect(first.books[0]?.bookId).not.toBe(second.books[0]?.bookId)
    })
  },
)
