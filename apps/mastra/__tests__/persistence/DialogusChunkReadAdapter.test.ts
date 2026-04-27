import type { Database } from '@dialogus/db'
import { describe, expect, it } from 'vitest'
import { DialogusChunkReadAdapter } from '../../src/persistence/DialogusChunkReadAdapter'

const fakeDb = {} as Database

describe('DialogusChunkReadAdapter', () => {
  it('throws on searchSemantic until 002 amendment lands SQL', async () => {
    const adapter = new DialogusChunkReadAdapter(fakeDb)
    await expect(adapter.searchSemantic({ bookIds: [], queryEmbedding: [], k: 1 })).rejects.toThrow(
      /Feature 002 amendment/,
    )
  })

  it('throws on findById until 002 amendment lands SQL', async () => {
    const adapter = new DialogusChunkReadAdapter(fakeDb)
    await expect(adapter.findById('a')).rejects.toThrow(/Feature 002 amendment/)
  })

  it('throws on findCharacterMentions until 002 amendment lands SQL', async () => {
    const adapter = new DialogusChunkReadAdapter(fakeDb)
    await expect(
      adapter.findCharacterMentions({ bookIds: [], aliases: [], limit: 1 }),
    ).rejects.toThrow(/Feature 002 amendment/)
  })
})
