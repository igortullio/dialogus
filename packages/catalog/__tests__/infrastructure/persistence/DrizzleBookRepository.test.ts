import type { Database } from '@dialogus/db/client'
import { describe, expect, it, vi } from 'vitest'
import type { Book } from '../../../src/domain/book/Book'
import { BookNotFoundError } from '../../../src/domain/book/BookError'
import type { Cursor } from '../../../src/domain/book/BookRepository.port'
import { DrizzleBookRepository } from '../../../src/infrastructure/persistence/DrizzleBookRepository'
import type { BookRow } from '../../../src/infrastructure/persistence/mappers/BookMapper'

const fixedCreated = new Date('2026-04-25T10:00:00.000Z')
const fixedUpdated = new Date('2026-04-25T10:01:00.000Z')

function buildRow(overrides: Partial<BookRow> = {}): BookRow {
  return {
    id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
    gutendexId: 996,
    title: 'Don Quixote',
    authors: [{ name: 'Cervantes', birthYear: 1547, deathYear: 1616 }],
    languages: ['en'],
    subjects: [],
    downloadUrlEpub: null,
    downloadUrlTxt: null,
    coverUrl: null,
    rawHash: null,
    ingestionStatus: 'discovered',
    ingestionError: null,
    ingestionProgress: 0,
    ingestionLastStage: null,
    ingestionStages: [],
    ingestionStartedAt: null,
    indexedAt: null,
    tags: [],
    createdAt: fixedCreated,
    updatedAt: fixedUpdated,
    deletedAt: null,
    ...overrides,
  }
}

function buildBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
    gutendexId: 996,
    title: 'Don Quixote',
    authors: [{ name: 'Cervantes', birthYear: 1547, deathYear: 1616 }],
    languages: ['en'],
    subjects: [],
    downloadUrlEpub: null,
    downloadUrlTxt: null,
    coverUrl: null,
    rawHash: null,
    ingestionStatus: 'discovered',
    ingestionError: null,
    tags: [],
    createdAt: fixedCreated,
    updatedAt: fixedUpdated,
    deletedAt: null,
    ...overrides,
  }
}

interface MockDbCalls {
  insertChain: {
    values: ReturnType<typeof vi.fn>
    onConflictDoUpdate: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
  }
  selectChain: {
    from: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    orderBy: ReturnType<typeof vi.fn>
    limit: ReturnType<typeof vi.fn>
  }
  updateChain: {
    set: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
  }
  query: {
    books: {
      findFirst: ReturnType<typeof vi.fn>
    }
  }
  insert: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

interface MockDbOptions {
  insertReturning?: BookRow[]
  findFirstResult?: BookRow | undefined
  selectRows?: BookRow[]
  updateReturning?: BookRow[]
}

function makeMockDb(opts: MockDbOptions = {}): { db: Database; calls: MockDbCalls } {
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(opts.insertReturning ?? []),
  }
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(opts.selectRows ?? []),
  }
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue(opts.updateReturning ?? []),
  }
  // restore() awaits `.where(...).returning()`, while softDelete() awaits `.where(...)` directly.
  // Pick the shape based on whether the caller declared returning rows.
  if (opts.updateReturning !== undefined) {
    updateChain.where.mockReturnValue({ returning: updateChain.returning })
  } else {
    updateChain.where.mockResolvedValue(undefined)
  }

  const query = {
    books: {
      findFirst: vi.fn().mockResolvedValue(opts.findFirstResult),
    },
  }
  const calls: MockDbCalls = {
    insertChain,
    selectChain,
    updateChain,
    query,
    insert: vi.fn().mockReturnValue(insertChain),
    select: vi.fn().mockReturnValue(selectChain),
    update: vi.fn().mockReturnValue(updateChain),
  }
  const db = {
    insert: calls.insert,
    select: calls.select,
    update: calls.update,
    query,
  } as unknown as Database
  return { db, calls }
}

describe('DrizzleBookRepository.save', () => {
  it('inserts a new book via INSERT ... ON CONFLICT (id) DO UPDATE and returns the persisted row', async () => {
    const { db, calls } = makeMockDb({ insertReturning: [buildRow()] })
    const repo = new DrizzleBookRepository(db)

    const result = await repo.save(buildBook())

    expect(calls.insert).toHaveBeenCalledTimes(1)
    expect(calls.insertChain.values).toHaveBeenCalledTimes(1)
    expect(calls.insertChain.onConflictDoUpdate).toHaveBeenCalledTimes(1)
    const upsertArg = calls.insertChain.onConflictDoUpdate.mock.calls[0]?.[0] as
      | { set?: Record<string, unknown> }
      | undefined
    expect(upsertArg?.set).toBeDefined()
    expect(upsertArg?.set).not.toHaveProperty('id')
    expect(upsertArg?.set).not.toHaveProperty('createdAt')
    expect(upsertArg?.set).toHaveProperty('updatedAt')
    expect(calls.insertChain.returning).toHaveBeenCalledTimes(1)
    expect(result.id).toBe('a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0')
  })

  it('updates the existing row when the upsert hits the conflict target', async () => {
    const updated = buildRow({ title: 'Don Quixote (revised)', updatedAt: new Date() })
    const { db, calls } = makeMockDb({ insertReturning: [updated] })
    const repo = new DrizzleBookRepository(db)

    const result = await repo.save(buildBook({ title: 'Don Quixote (revised)' }))

    expect(calls.insertChain.values).toHaveBeenCalledTimes(1)
    expect(calls.insertChain.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ set: expect.objectContaining({ title: 'Don Quixote (revised)' }) }),
    )
    expect(result.title).toBe('Don Quixote (revised)')
  })

  it('throws when the database returns no row from the upsert', async () => {
    const { db } = makeMockDb({ insertReturning: [] })
    const repo = new DrizzleBookRepository(db)
    await expect(repo.save(buildBook())).rejects.toThrow(/no row/)
  })
})

describe('DrizzleBookRepository.findById', () => {
  it('returns null when no row is found', async () => {
    const { db } = makeMockDb({ findFirstResult: undefined })
    const repo = new DrizzleBookRepository(db)
    const result = await repo.findById('nope')
    expect(result).toBeNull()
  })

  it('maps the row to a Book entity when found', async () => {
    const { db, calls } = makeMockDb({ findFirstResult: buildRow() })
    const repo = new DrizzleBookRepository(db)
    const result = await repo.findById('a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0')
    expect(calls.query.books.findFirst).toHaveBeenCalledTimes(1)
    expect(result?.id).toBe('a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0')
  })
})

describe('DrizzleBookRepository.findByGutendexId', () => {
  it('returns null when no row is found', async () => {
    const { db } = makeMockDb({ findFirstResult: undefined })
    const repo = new DrizzleBookRepository(db)
    const result = await repo.findByGutendexId(996)
    expect(result).toBeNull()
  })

  it('returns a soft-deleted row (no deleted_at filter applied)', async () => {
    const softDeletedRow = buildRow({ deletedAt: new Date('2026-04-26T00:00:00.000Z') })
    const { db } = makeMockDb({ findFirstResult: softDeletedRow })
    const repo = new DrizzleBookRepository(db)
    const result = await repo.findByGutendexId(996)
    expect(result).not.toBeNull()
    expect(result?.deletedAt).toEqual(softDeletedRow.deletedAt)
  })
})

describe('DrizzleBookRepository.list', () => {
  it('orders by created_at DESC, id DESC and applies LIMIT n+1 to detect next page', async () => {
    const { db, calls } = makeMockDb({ selectRows: [] })
    const repo = new DrizzleBookRepository(db)
    await repo.list({}, undefined, 20)
    expect(calls.select).toHaveBeenCalledTimes(2)
    expect(calls.selectChain.from).toHaveBeenCalledTimes(2)
    expect(calls.selectChain.orderBy).toHaveBeenCalledTimes(1)
    expect(calls.selectChain.limit).toHaveBeenCalledWith(21)
  })

  it('applies the deleted_at IS NULL filter by default', async () => {
    const { db, calls } = makeMockDb({ selectRows: [] })
    const repo = new DrizzleBookRepository(db)
    await repo.list({})
    expect(calls.selectChain.where).toHaveBeenCalledTimes(2)
    const where = calls.selectChain.where.mock.calls[0]?.[0]
    expect(where).toBeDefined()
  })

  it('omits the deleted_at filter when includeDeleted=true', async () => {
    const { db, calls } = makeMockDb({ selectRows: [] })
    const repo = new DrizzleBookRepository(db)
    await repo.list({ includeDeleted: true })
    expect(calls.selectChain.where).toHaveBeenCalledTimes(2)
    expect(calls.selectChain.where.mock.calls[0]?.[0]).toBeUndefined()
  })

  it('applies the deleted_at filter when includeDeleted=false (explicit)', async () => {
    const { db, calls } = makeMockDb({ selectRows: [] })
    const repo = new DrizzleBookRepository(db)
    await repo.list({ includeDeleted: false })
    expect(calls.selectChain.where.mock.calls[0]?.[0]).toBeDefined()
  })

  it('issues a tuple-compare filter when a cursor is supplied', async () => {
    const { db, calls } = makeMockDb({ selectRows: [] })
    const repo = new DrizzleBookRepository(db)
    const cursor: Cursor = {
      createdAt: new Date('2026-04-24T12:00:00.000Z'),
      id: 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
    }
    await repo.list({ includeDeleted: true }, cursor, 5)
    const passedWhere = calls.selectChain.where.mock.calls[0]?.[0]
    expect(passedWhere).toBeDefined()
    expect(calls.selectChain.limit).toHaveBeenCalledWith(6)
  })

  it('does not issue a cursor predicate when cursor is undefined', async () => {
    const { db, calls } = makeMockDb({ selectRows: [] })
    const repo = new DrizzleBookRepository(db)
    await repo.list({ includeDeleted: true }, undefined, 5)
    expect(calls.selectChain.where.mock.calls[0]?.[0]).toBeUndefined()
  })

  it('returns nextCursor=null when fewer than limit+1 rows are returned', async () => {
    const { db } = makeMockDb({ selectRows: [buildRow(), buildRow({ id: 'other' })] })
    const repo = new DrizzleBookRepository(db)
    const result = await repo.list({}, undefined, 10)
    expect(result.books).toHaveLength(2)
    expect(result.nextCursor).toBeNull()
  })

  it('returns nextCursor pointing at the last in-page row when limit+1 rows came back', async () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      buildRow({
        id: `aaaaaaaa-aaaa-aaaa-aaaa-${String(i).padStart(12, '0')}`,
        createdAt: new Date(2026, 0, 1, 0, 0, 0, i),
      }),
    )
    const { db } = makeMockDb({ selectRows: rows })
    const repo = new DrizzleBookRepository(db)
    const result = await repo.list({}, undefined, 3)
    expect(result.books).toHaveLength(3)
    expect(result.nextCursor).not.toBeNull()
    expect(result.nextCursor?.id).toBe(rows[2]?.id)
    expect(result.nextCursor?.createdAt).toEqual(rows[2]?.createdAt)
  })

  it('combines status, language, and includeDeleted filters when all are present', async () => {
    const { db, calls } = makeMockDb({ selectRows: [] })
    const repo = new DrizzleBookRepository(db)
    await repo.list({ status: 'ready', language: 'pt', includeDeleted: false })
    expect(calls.selectChain.where.mock.calls[0]?.[0]).toBeDefined()
  })
})

describe('DrizzleBookRepository.softDelete', () => {
  it('issues an UPDATE that sets deleted_at and updated_at without deleting the row', async () => {
    const { db, calls } = makeMockDb()
    const repo = new DrizzleBookRepository(db)
    await repo.softDelete('a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0')
    expect(calls.update).toHaveBeenCalledTimes(1)
    expect(calls.updateChain.set).toHaveBeenCalledTimes(1)
    const setArg = calls.updateChain.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined
    expect(setArg).toBeDefined()
    expect(Object.keys(setArg ?? {}).sort()).toEqual(['deletedAt', 'updatedAt'])
    expect(calls.updateChain.where).toHaveBeenCalledTimes(1)
    expect(calls.updateChain.returning).not.toHaveBeenCalled()
  })
})

describe('DrizzleBookRepository.restore', () => {
  it('throws BookNotFoundError when no row is updated', async () => {
    const { db } = makeMockDb({ updateReturning: [] })
    const repo = new DrizzleBookRepository(db)
    await expect(repo.restore('nope')).rejects.toBeInstanceOf(BookNotFoundError)
  })

  it('returns the restored book when the row exists (regardless of prior deleted_at)', async () => {
    const restoredRow = buildRow({ deletedAt: null, updatedAt: new Date() })
    const { db, calls } = makeMockDb({ updateReturning: [restoredRow] })
    const repo = new DrizzleBookRepository(db)
    const result = await repo.restore('a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0')
    expect(result.id).toBe(restoredRow.id)
    expect(result.deletedAt).toBeNull()
    const setArg = calls.updateChain.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined
    expect(setArg?.deletedAt).toBeNull()
    expect(setArg).toHaveProperty('updatedAt')
  })
})
