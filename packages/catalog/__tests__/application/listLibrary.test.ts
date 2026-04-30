import { describe, expect, it, vi } from 'vitest'
import { listLibrary } from '../../src/application/listLibrary'
import type { Book } from '../../src/domain/book/Book'
import type { BookRepository, ListResult } from '../../src/domain/book/BookRepository.port'

function makeBook(overrides: Partial<Book> = {}): Book {
  const now = new Date('2026-04-01T00:00:00Z')
  return {
    id: 'book-uuid-1',
    gutendexId: 996,
    title: 'Don Quixote',
    authors: [{ name: 'Cervantes', birthYear: 1547, deathYear: 1616 }],
    languages: ['en'],
    subjects: ['Fiction'],
    downloadUrlEpub: null,
    downloadUrlTxt: null,
    coverUrl: null,
    rawHash: null,
    ingestionStatus: 'discovered',
    ingestionError: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  }
}

function fakeRepository(listResult: ListResult): BookRepository {
  return {
    save: vi.fn(),
    findById: vi.fn(),
    findByGutendexId: vi.fn(),
    list: vi.fn(async () => listResult),
    softDelete: vi.fn(),
    restore: vi.fn(),
  }
}

describe('listLibrary', () => {
  it('returns the repository response unchanged for an empty filter and no cursor', async () => {
    const result: ListResult = { books: [], nextCursor: null, total: 0 }
    const repository = fakeRepository(result)

    const out = await listLibrary({ repository }, { filter: {}, cursor: undefined })

    expect(repository.list).toHaveBeenCalledWith({}, undefined, undefined)
    expect(out).toBe(result)
  })

  it('forwards filter, cursor, and limit through to the repository', async () => {
    const result: ListResult = {
      books: [makeBook({ id: 'a' }), makeBook({ id: 'b' })],
      nextCursor: { createdAt: new Date('2026-04-02T00:00:00Z'), id: 'b' },
      total: 2,
    }
    const repository = fakeRepository(result)
    const cursor = { createdAt: new Date('2026-03-15T00:00:00Z'), id: 'prev-id' }

    const out = await listLibrary(
      { repository },
      { filter: { status: 'ready', language: 'pt', includeDeleted: true }, cursor, limit: 10 },
    )

    expect(repository.list).toHaveBeenCalledWith(
      { status: 'ready', language: 'pt', includeDeleted: true },
      cursor,
      10,
    )
    expect(out).toBe(result)
    expect(out.books).toHaveLength(2)
    expect(out.nextCursor?.id).toBe('b')
  })

  it('does not mutate the repository response', async () => {
    const result: ListResult = {
      books: [makeBook({ id: 'a' })],
      nextCursor: null,
      total: 1,
    }
    const repository = fakeRepository(result)

    const out = await listLibrary({ repository }, { filter: {} })

    expect(out.books).toBe(result.books)
    expect(out.nextCursor).toBeNull()
  })
})
