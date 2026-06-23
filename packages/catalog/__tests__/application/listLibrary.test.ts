import { describe, expect, it, vi } from 'vitest'
import { listLibrary } from '../../src/application/listLibrary'
import type { Book } from '../../src/domain/book/Book'
import type { ListResult } from '../../src/domain/book/BookRepository.port'
import type { LibraryEntryRepository } from '../../src/domain/libraryEntry/LibraryEntryRepository.port'

const USER = 'user-1'

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

function fakeLibraryRepo(listResult: ListResult): LibraryEntryRepository {
  return {
    upsertMembership: vi.fn(),
    isActiveMember: vi.fn(),
    softRemove: vi.fn(),
    restore: vi.fn(),
    listForUser: vi.fn(async () => listResult),
    countInFlight: vi.fn(),
  }
}

describe('listLibrary', () => {
  it('forwards an empty filter and no cursor to listForUser scoped to the user', async () => {
    const result: ListResult = { books: [], nextCursor: null, total: 0 }
    const libraryRepo = fakeLibraryRepo(result)

    const out = await listLibrary({ libraryRepo }, USER, { filter: {}, cursor: undefined })

    expect(libraryRepo.listForUser).toHaveBeenCalledWith(USER, {}, undefined, undefined)
    expect(out).toBe(result)
  })

  it('forwards filter, cursor, and limit through to listForUser', async () => {
    const result: ListResult = {
      books: [makeBook({ id: 'a' }), makeBook({ id: 'b' })],
      nextCursor: { createdAt: new Date('2026-04-02T00:00:00Z'), id: 'b' },
      total: 2,
    }
    const libraryRepo = fakeLibraryRepo(result)
    const cursor = { createdAt: new Date('2026-03-15T00:00:00Z'), id: 'prev-id' }

    const out = await listLibrary({ libraryRepo }, USER, {
      filter: { status: 'ready', language: 'pt', includeDeleted: true },
      cursor,
      limit: 10,
    })

    expect(libraryRepo.listForUser).toHaveBeenCalledWith(
      USER,
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
    const libraryRepo = fakeLibraryRepo(result)

    const out = await listLibrary({ libraryRepo }, USER, { filter: {} })

    expect(out.books).toBe(result.books)
    expect(out.nextCursor).toBeNull()
  })
})
