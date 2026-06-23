import { describe, expect, it, vi } from 'vitest'
import { getBook } from '../../src/application/getBook'
import type { Book } from '../../src/domain/book/Book'
import { BookNotFoundError } from '../../src/domain/book/BookError'
import type { BookRepository } from '../../src/domain/book/BookRepository.port'
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

function fakeRepository(found: Book | null): BookRepository {
  return {
    save: vi.fn(),
    findById: vi.fn(async () => found),
    findByGutendexId: vi.fn(),
    list: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  }
}

function fakeLibraryRepo(isActiveMember: boolean): LibraryEntryRepository {
  return {
    upsertMembership: vi.fn(async () => undefined),
    isActiveMember: vi.fn(async () => isActiveMember),
    softRemove: vi.fn(async () => true),
    restore: vi.fn(async () => true),
    listForUser: vi.fn(async () => ({ books: [], nextCursor: null, total: 0 })),
    countInFlight: vi.fn(async () => 0),
  }
}

describe('getBook', () => {
  it('returns the book when the user is an active member', async () => {
    const book = makeBook({ id: 'uuid-1' })
    const repository = fakeRepository(book)
    const libraryRepo = fakeLibraryRepo(true)

    const result = await getBook({ repository, libraryRepo }, USER, 'uuid-1')

    expect(libraryRepo.isActiveMember).toHaveBeenCalledWith(USER, 'uuid-1')
    expect(repository.findById).toHaveBeenCalledWith('uuid-1')
    expect(result).toBe(book)
  })

  it('throws BookNotFoundError for a non-member (cross-user; no existence leak)', async () => {
    const repository = fakeRepository(makeBook({ id: 'uuid-2' }))
    const libraryRepo = fakeLibraryRepo(false)

    await expect(getBook({ repository, libraryRepo }, USER, 'uuid-2')).rejects.toBeInstanceOf(
      BookNotFoundError,
    )
    expect(repository.findById).not.toHaveBeenCalled()
  })

  it('throws BookNotFoundError when membership exists but the shared book is missing', async () => {
    const repository = fakeRepository(null)
    const libraryRepo = fakeLibraryRepo(true)

    await expect(getBook({ repository, libraryRepo }, USER, 'missing-uuid')).rejects.toMatchObject({
      code: 'BOOK_NOT_FOUND',
    })
  })
})
