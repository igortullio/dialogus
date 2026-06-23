import { describe, expect, it, vi } from 'vitest'
import { restoreBook } from '../../src/application/restoreBook'
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
    ingestionStatus: 'ready',
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

function fakeLibraryRepo(restore: boolean): LibraryEntryRepository {
  return {
    upsertMembership: vi.fn(),
    isActiveMember: vi.fn(),
    softRemove: vi.fn(),
    restore: vi.fn(async () => restore),
    listForUser: vi.fn(),
    countInFlight: vi.fn(),
  }
}

describe('restoreBook', () => {
  it('restores the membership and returns the shared book', async () => {
    const book = makeBook({ id: 'uuid-soft' })
    const repository = fakeRepository(book)
    const libraryRepo = fakeLibraryRepo(true)

    const out = await restoreBook({ repository, libraryRepo }, USER, 'uuid-soft')

    expect(libraryRepo.restore).toHaveBeenCalledWith(USER, 'uuid-soft')
    expect(repository.findById).toHaveBeenCalledWith('uuid-soft')
    expect(out).toBe(book)
  })

  it('throws BookNotFoundError when the user has no membership row to restore', async () => {
    const repository = fakeRepository(makeBook())
    const libraryRepo = fakeLibraryRepo(false)

    await expect(
      restoreBook({ repository, libraryRepo }, USER, 'missing-uuid'),
    ).rejects.toBeInstanceOf(BookNotFoundError)
    expect(repository.findById).not.toHaveBeenCalled()
  })

  it('throws BookNotFoundError when the membership restores but the shared book is missing', async () => {
    const repository = fakeRepository(null)
    const libraryRepo = fakeLibraryRepo(true)

    await expect(restoreBook({ repository, libraryRepo }, USER, 'uuid-gone')).rejects.toMatchObject(
      {
        code: 'BOOK_NOT_FOUND',
      },
    )
  })
})
