import type { Database } from '@dialogus/db/client'
import { describe, expect, it, vi } from 'vitest'
import type { Chapter } from '../../../src/domain/chapter/Chapter'
import { DrizzleChapterRepository } from '../../../src/infrastructure/persistence/DrizzleChapterRepository'
import type { ChapterRow } from '../../../src/infrastructure/persistence/mappers/ChapterMapper'

const fixedCreated = new Date('2026-04-25T10:00:00.000Z')

function buildRow(overrides: Partial<ChapterRow> = {}): ChapterRow {
  return {
    id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
    bookId: 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1',
    ordinal: 1,
    title: 'Loomings',
    plainText: 'Call me Ishmael...',
    tokenCount: 1234,
    createdAt: fixedCreated,
    ...overrides,
  }
}

function buildChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
    bookId: 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1',
    ordinal: 1,
    title: 'Loomings',
    plainText: 'Call me Ishmael...',
    tokenCount: 1234,
    createdAt: fixedCreated,
    ...overrides,
  }
}

interface MockDbCalls {
  insertChain: {
    values: ReturnType<typeof vi.fn>
    onConflictDoNothing: ReturnType<typeof vi.fn>
  }
  selectChain: {
    from: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    orderBy: ReturnType<typeof vi.fn>
  }
  countChain: {
    from: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
  }
  query: {
    chapters: {
      findFirst: ReturnType<typeof vi.fn>
    }
  }
  insert: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
}

interface MockDbOptions {
  selectRows?: ChapterRow[]
  countRow?: { count: number } | undefined
  findFirstResult?: ChapterRow | undefined
}

function makeMockDb(opts: MockDbOptions = {}): { db: Database; calls: MockDbCalls } {
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  }
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(opts.selectRows ?? []),
  }
  const countChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(opts.countRow ? [opts.countRow] : []),
  }
  const query = {
    chapters: {
      findFirst: vi.fn().mockResolvedValue(opts.findFirstResult),
    },
  }
  // select() distinguishes the "list" path (no args) from the "count" path (object arg).
  const select = vi.fn((...args: unknown[]) => (args.length === 0 ? selectChain : countChain))
  const insert = vi.fn().mockReturnValue(insertChain)
  const calls: MockDbCalls = {
    insertChain,
    selectChain,
    countChain,
    query,
    insert,
    select,
  }
  const db = {
    insert,
    select,
    query,
  } as unknown as Database
  return { db, calls }
}

describe('DrizzleChapterRepository.saveMany', () => {
  it('issues a single INSERT ... ON CONFLICT (book_id, ordinal) DO NOTHING for the batch', async () => {
    const { db, calls } = makeMockDb()
    const repo = new DrizzleChapterRepository(db)
    await repo.saveMany([buildChapter(), buildChapter({ ordinal: 2, id: 'other' })])
    expect(calls.insert).toHaveBeenCalledTimes(1)
    expect(calls.insertChain.values).toHaveBeenCalledTimes(1)
    expect(calls.insertChain.onConflictDoNothing).toHaveBeenCalledTimes(1)
    const valuesArg = calls.insertChain.values.mock.calls[0]?.[0]
    expect(Array.isArray(valuesArg)).toBe(true)
    expect((valuesArg as unknown[]).length).toBe(2)
  })

  it('returns immediately without issuing a query when the input is empty', async () => {
    const { db, calls } = makeMockDb()
    const repo = new DrizzleChapterRepository(db)
    await repo.saveMany([])
    expect(calls.insert).not.toHaveBeenCalled()
  })
})

describe('DrizzleChapterRepository.listByBookId', () => {
  it('orders by ordinal ASC and maps the rows to domain entities', async () => {
    const rows = [buildRow({ ordinal: 1 }), buildRow({ ordinal: 2, id: 'other' })]
    const { db, calls } = makeMockDb({ selectRows: rows })
    const repo = new DrizzleChapterRepository(db)
    const result = await repo.listByBookId('b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1')
    expect(calls.select).toHaveBeenCalledTimes(1)
    expect(calls.selectChain.from).toHaveBeenCalledTimes(1)
    expect(calls.selectChain.where).toHaveBeenCalledTimes(1)
    expect(calls.selectChain.orderBy).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(2)
    expect(result[0]?.ordinal).toBe(1)
    expect(result[1]?.ordinal).toBe(2)
  })
})

describe('DrizzleChapterRepository.countByBookId', () => {
  it('returns the mocked count value', async () => {
    const { db } = makeMockDb({ countRow: { count: 17 } })
    const repo = new DrizzleChapterRepository(db)
    const count = await repo.countByBookId('b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1')
    expect(count).toBe(17)
  })

  it('returns 0 when the count row is missing', async () => {
    const { db } = makeMockDb({ countRow: undefined })
    const repo = new DrizzleChapterRepository(db)
    const count = await repo.countByBookId('b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1')
    expect(count).toBe(0)
  })
})

describe('DrizzleChapterRepository.findById', () => {
  it('returns null when no row is found', async () => {
    const { db } = makeMockDb({ findFirstResult: undefined })
    const repo = new DrizzleChapterRepository(db)
    expect(await repo.findById('nope')).toBeNull()
  })

  it('returns a domain entity when the row is found', async () => {
    const row = buildRow()
    const { db, calls } = makeMockDb({ findFirstResult: row })
    const repo = new DrizzleChapterRepository(db)
    const chapter = await repo.findById(row.id)
    expect(calls.query.chapters.findFirst).toHaveBeenCalledTimes(1)
    expect(chapter?.id).toBe(row.id)
    expect(chapter?.title).toBe(row.title)
  })
})
