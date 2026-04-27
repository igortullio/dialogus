import { spawnSync } from 'node:child_process'
import { MockQueryEmbedder, semanticSearchTool } from '@dialogus/rag'
import { isValidationError } from '@mastra/core/tools'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DialogusChunkReadAdapter } from '../../src/persistence/DialogusChunkReadAdapter'
import {
  clearAllSeededData,
  type PostgresContext,
  type SeededBook,
  seedFixtures,
  startPostgres,
  stopPostgres,
} from './_helpers/seed'

const dockerAvailable = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}']).status === 0

const noopLogger = {
  info: vi.fn(),
  error: vi.fn(),
}

function makeTool(pg: PostgresContext) {
  return semanticSearchTool({
    chunkRepo: new DialogusChunkReadAdapter(pg.db),
    queryEmbedder: new MockQueryEmbedder(),
    logger: noopLogger,
  })
}

async function runSearch(
  pg: PostgresContext,
  input: Parameters<NonNullable<ReturnType<typeof makeTool>['execute']>>[0],
) {
  const tool = makeTool(pg)
  const result = await tool.execute?.(input, {})
  if (!result || isValidationError(result)) {
    throw new Error('expected a successful semantic_search tool output')
  }
  return result
}

describe.skipIf(!dockerAvailable)(
  'semantic-search integration — semanticSearchTool + DialogusChunkReadAdapter',
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
      noopLogger.info.mockReset()
      noopLogger.error.mockReset()
    })

    it('top-k=3 on single book returns 3 chunks in score-descending order', async () => {
      const seeded = await seedFixtures(pg.db, [
        {
          title: 'Single Book',
          chapterCount: 5,
          chunksPerChapter: 3,
          chunkText: (chapter, chunk) => `single-book passage about whaling ${chapter}-${chunk}`,
        },
      ])
      const book = seeded.books[0] as SeededBook
      const targetText = book.chunkTexts[2]?.[1] as string
      const result = await runSearch(pg, {
        query: targetText,
        book_ids: [book.bookId],
        k: 3,
      })
      expect(result.chunks).toHaveLength(3)
      const scores = result.chunks.map((c) => c.score)
      for (let i = 1; i < scores.length; i += 1) {
        expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i] as number)
      }
      expect(result.chunks[0]?.score).toBeGreaterThan(0.999)
      const targetChunkId = book.chunkIds[2]?.[1] as string
      expect(result.chunks[0]?.chunk_id).toBe(targetChunkId)
    })

    it('multi-book global top-k mixes across both books', async () => {
      const seeded = await seedFixtures(pg.db, [
        {
          title: 'Book One',
          chapterCount: 5,
          chunksPerChapter: 2,
          chunkText: (chapter, chunk) => `book-one chapter ${chapter} chunk ${chunk} content`,
        },
        {
          title: 'Book Two',
          chapterCount: 5,
          chunksPerChapter: 2,
          chunkText: (chapter, chunk) => `book-two chapter ${chapter} chunk ${chunk} content`,
        },
      ])
      const [book1, book2] = seeded.books
      if (!book1 || !book2) throw new Error('expected two seeded books')
      const queryText = book2.chunkTexts[3]?.[0] as string
      const result = await runSearch(pg, {
        query: queryText,
        book_ids: [book1.bookId, book2.bookId],
        k: 5,
      })
      expect(result.chunks).toHaveLength(5)
      const bookIdsInResult = new Set(result.chunks.map((c) => c.book_id))
      expect(bookIdsInResult.has(book2.bookId)).toBe(true)
      expect(result.chunks[0]?.book_id).toBe(book2.bookId)
    })

    it('spoiler cap excludes chunks above the capped chapter ordinal', async () => {
      const seeded = await seedFixtures(pg.db, [
        {
          title: 'Capped Book',
          chapterCount: 5,
          chunksPerChapter: 2,
          chunkText: (chapter, chunk) => `capped book chapter ${chapter} chunk ${chunk} content`,
        },
      ])
      const book = seeded.books[0] as SeededBook
      const queryText = book.chunkTexts[4]?.[0] as string
      const result = await runSearch(pg, {
        query: queryText,
        book_ids: [book.bookId],
        spoiler_caps: { [book.bookId]: 2 },
        k: 5,
      })
      expect(result.chunks.length).toBeGreaterThan(0)
      for (const chunk of result.chunks) {
        expect(chunk.chapter_ordinal).toBeLessThanOrEqual(2)
      }
    })
  },
)
