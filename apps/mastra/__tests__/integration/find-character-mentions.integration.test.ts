import { spawnSync } from 'node:child_process'
import { findCharacterMentionsTool } from '@dialogus/rag'
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
  'find-character-mentions integration — diacritics + ordering',
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

    it('returns Ishmael + Ishmaël (diacritics-insensitive) sorted by chapter ordinal', async () => {
      const chapter1Text = 'Call me Ishmael. Some years ago—never mind how long precisely.'
      const chapter2Text =
        'Queequeg appears prominently in this chapter without the focal narrator.'
      const chapter3Text = 'Ishmaël (the spelling here uses a diacritic) returns to the narrative.'
      const chapter4Text = 'Ahab broods on the quarterdeck. No focal character is named.'

      const chunkText = (chapter: number) => {
        switch (chapter) {
          case 0:
            return chapter1Text
          case 1:
            return chapter2Text
          case 2:
            return chapter3Text
          default:
            return chapter4Text
        }
      }

      const seeded = await seedFixtures(pg.db, [
        {
          title: 'Mentions Book',
          chapterCount: 4,
          chunksPerChapter: 1,
          chunkText,
        },
      ])
      const book = seeded.books[0] as SeededBook

      const tool = findCharacterMentionsTool({
        chunkRepo: new DialogusChunkReadAdapter(pg.db),
        logger: noopLogger,
      })

      const result = await tool.execute?.(
        {
          book_ids: [book.bookId],
          aliases: ['Ishmael'],
          limit: 20,
        },
        {},
      )
      if (!result || isValidationError(result)) {
        throw new Error('expected a successful find_character_mentions tool output')
      }
      expect(result.mentions).toHaveLength(2)
      expect(result.mentions.map((m) => m.chapter_ordinal)).toEqual([1, 3])
      expect(result.mentions[0]?.text).toContain('Ishmael')
      expect(result.mentions[1]?.text).toContain('Ishmaël')
    })
  },
)
