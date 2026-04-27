import type { Database } from '@dialogus/db'
import { describe, expect, it, vi } from 'vitest'
import { DialogusChunkReadAdapter } from '../../src/persistence/DialogusChunkReadAdapter'

function makeFakeDb(rows: Record<string, unknown>[]): Database {
  return { execute: vi.fn().mockResolvedValue(rows) } as unknown as Database
}

const SEED_ROW = {
  chunkId: '11111111-1111-4111-8111-111111111111',
  bookId: '22222222-2222-4222-8222-222222222222',
  chapterId: '33333333-3333-4333-8333-333333333333',
  chapterOrdinal: 1,
  chapterTitle: 'Chapter 1',
  text: 'long text body that should be sliced into the excerpt preview',
  score: 0.42,
}

describe('DialogusChunkReadAdapter', () => {
  it('searchSemantic returns mapped ChunkWithContext entries with excerpt slice', async () => {
    const db = makeFakeDb([SEED_ROW])
    const adapter = new DialogusChunkReadAdapter(db)
    const result = await adapter.searchSemantic({
      bookIds: [SEED_ROW.bookId],
      queryEmbedding: new Array(1536).fill(0),
      k: 5,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      chunkId: SEED_ROW.chunkId,
      bookId: SEED_ROW.bookId,
      chapterId: SEED_ROW.chapterId,
      chapterOrdinal: 1,
      score: 0.42,
    })
    expect(result[0]?.excerptPreview).toBe(SEED_ROW.text.slice(0, 200))
  })

  it('searchSemantic short-circuits on empty bookIds', async () => {
    const db = makeFakeDb([])
    const adapter = new DialogusChunkReadAdapter(db)
    const result = await adapter.searchSemantic({
      bookIds: [],
      queryEmbedding: [],
      k: 5,
    })
    expect(result).toEqual([])
    expect(db.execute).not.toHaveBeenCalled()
  })

  it('findById returns null when no row is found', async () => {
    const db = makeFakeDb([])
    const adapter = new DialogusChunkReadAdapter(db)
    const result = await adapter.findById(SEED_ROW.chunkId)
    expect(result).toBeNull()
  })

  it('findCharacterMentions short-circuits when bookIds or aliases are empty', async () => {
    const db = makeFakeDb([])
    const adapter = new DialogusChunkReadAdapter(db)
    const noBooks = await adapter.findCharacterMentions({
      bookIds: [],
      aliases: ['Ishmael'],
      limit: 5,
    })
    const noAliases = await adapter.findCharacterMentions({
      bookIds: [SEED_ROW.bookId],
      aliases: [],
      limit: 5,
    })
    expect(noBooks).toEqual([])
    expect(noAliases).toEqual([])
    expect(db.execute).not.toHaveBeenCalled()
  })
})
