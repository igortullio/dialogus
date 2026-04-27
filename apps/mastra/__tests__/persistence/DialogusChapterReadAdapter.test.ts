import type { Database } from '@dialogus/db'
import { describe, expect, it } from 'vitest'
import { DialogusChapterReadAdapter } from '../../src/persistence/DialogusChapterReadAdapter'

interface ChapterRow {
  id: string
  bookId: string
  ordinal: number
  title: string
  tokenCount: number
}

function fakeDatabaseReturning(rows: ChapterRow[]): Database {
  const builder = {
    from: () => builder,
    where: () => builder,
    orderBy: () => Promise.resolve(rows),
    limit: () => Promise.resolve(rows),
  }
  const db = {
    select: () => builder,
  }
  return db as unknown as Database
}

describe('DialogusChapterReadAdapter', () => {
  it('listByBook maps rows to ChapterView', async () => {
    const rows: ChapterRow[] = [
      { id: 'c1', bookId: 'b1', ordinal: 1, title: 'I', tokenCount: 100 },
      { id: 'c2', bookId: 'b1', ordinal: 2, title: 'II', tokenCount: 200 },
    ]
    const adapter = new DialogusChapterReadAdapter(fakeDatabaseReturning(rows))
    const views = await adapter.listByBook('b1')
    expect(views).toEqual(rows)
  })

  it('findById returns the first row mapped or null when missing', async () => {
    const present = await new DialogusChapterReadAdapter(
      fakeDatabaseReturning([{ id: 'c1', bookId: 'b1', ordinal: 1, title: 'I', tokenCount: 100 }]),
    ).findById('c1')
    expect(present).toEqual({ id: 'c1', bookId: 'b1', ordinal: 1, title: 'I', tokenCount: 100 })

    const absent = await new DialogusChapterReadAdapter(fakeDatabaseReturning([])).findById('c1')
    expect(absent).toBeNull()
  })
})
