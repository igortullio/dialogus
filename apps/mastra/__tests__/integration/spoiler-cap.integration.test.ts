import { spawnSync } from 'node:child_process'
import { findCharacterMentionsTool, MockQueryEmbedder, semanticSearchTool } from '@dialogus/rag'
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

describe.skipIf(!dockerAvailable)(
  'spoiler-cap integration — per-user SQL filter (citations)',
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

    it('5-chapter book with cap=2 returns zero chunks above ordinal 2', async () => {
      const seeded = await seedFixtures(pg.db, [
        {
          title: 'Capped 5-Chapter Book',
          chapterCount: 5,
          chunksPerChapter: 2,
          chunkText: (chapter, chunk) => `chapter ${chapter} chunk ${chunk} body content`,
        },
      ])
      const book = seeded.books[0] as SeededBook
      const tool = semanticSearchTool({
        chunkRepo: new DialogusChunkReadAdapter(pg.db),
        queryEmbedder: new MockQueryEmbedder(),
        logger: noopLogger,
      })

      const queryText = book.chunkTexts[4]?.[0] as string
      const result = await tool.execute?.(
        {
          query: queryText,
          book_ids: [book.bookId],
          spoiler_caps: { [book.bookId]: 2 },
          k: 10,
        },
        {},
      )
      if (!result || isValidationError(result)) {
        throw new Error('expected a successful semantic_search tool output')
      }
      expect(result.chunks.length).toBeGreaterThan(0)
      const violatingChunks = result.chunks.filter((c) => c.chapter_ordinal > 2)
      expect(violatingChunks).toEqual([])
    })

    it('find_character_mentions with cap=2 yields no citations above ordinal 2', async () => {
      // Every chunk mentions the alias across all 5 chapters, so without a cap the
      // mentions span beyond chapter 2; with cap=2 the SQL clause excludes them.
      const seeded = await seedFixtures(pg.db, [
        {
          title: 'Mentions 5-Chapter Book',
          chapterCount: 5,
          chunksPerChapter: 2,
          chunkText: (chapter, chunk) => `chapter ${chapter} chunk ${chunk}: Ishmael appears here`,
        },
      ])
      const book = seeded.books[0] as SeededBook
      const tool = findCharacterMentionsTool({
        chunkRepo: new DialogusChunkReadAdapter(pg.db),
        logger: noopLogger,
      })

      // Sanity: uncapped, mentions reach beyond chapter 2.
      const uncapped = await tool.execute?.(
        { book_ids: [book.bookId], aliases: ['Ishmael'], limit: 50 },
        {},
      )
      if (!uncapped || isValidationError(uncapped)) {
        throw new Error('expected a successful find_character_mentions output')
      }
      expect(uncapped.mentions.some((m) => m.chapter_ordinal > 2)).toBe(true)

      // Capped at chapter 2: every returned citation is at or below ordinal 2.
      const capped = await tool.execute?.(
        {
          book_ids: [book.bookId],
          aliases: ['Ishmael'],
          spoiler_caps: { [book.bookId]: 2 },
          limit: 50,
        },
        {},
      )
      if (!capped || isValidationError(capped)) {
        throw new Error('expected a successful find_character_mentions output')
      }
      expect(capped.mentions.length).toBeGreaterThan(0)
      expect(capped.mentions.filter((m) => m.chapter_ordinal > 2)).toEqual([])
    })
  },
)
