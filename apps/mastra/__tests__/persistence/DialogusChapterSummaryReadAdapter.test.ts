import type { Database } from '@dialogus/db'
import { describe, expect, it } from 'vitest'
import { DialogusChapterSummaryReadAdapter } from '../../src/persistence/DialogusChapterSummaryReadAdapter'

interface SummaryRow {
  bookId: string
  chapterId: string
  chapterOrdinal: number
  chapterTitle: string
  summary: string
  tokenCount: number
  model: string
  generatedAt: Date
}

function fakeDatabaseReturning(rows: SummaryRow[]): Database {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(rows),
  }
  const db = {
    select: () => builder,
  }
  return db as unknown as Database
}

describe('DialogusChapterSummaryReadAdapter', () => {
  it('returns the joined summary view when present', async () => {
    const row: SummaryRow = {
      bookId: 'b1',
      chapterId: 'c1',
      chapterOrdinal: 5,
      chapterTitle: 'Chapter Five',
      summary: 'A summary.',
      tokenCount: 42,
      model: 'claude-haiku-4-5',
      generatedAt: new Date('2026-04-27T00:00:00Z'),
    }
    const adapter = new DialogusChapterSummaryReadAdapter(fakeDatabaseReturning([row]))
    const view = await adapter.findByChapterId('c1')
    expect(view).toEqual(row)
  })

  it('returns null when no row matches', async () => {
    const adapter = new DialogusChapterSummaryReadAdapter(fakeDatabaseReturning([]))
    const view = await adapter.findByChapterId('missing')
    expect(view).toBeNull()
  })
})
