import { describe, expect, it, vi } from 'vitest'
import { removeBook } from '../../src/application/removeBook'
import type { Book } from '../../src/domain/book/Book'
import { BookNotFoundError } from '../../src/domain/book/BookError'
import type { BookRepository } from '../../src/domain/book/BookRepository.port'

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
    softDelete: vi.fn(async () => undefined),
    restore: vi.fn(),
  }
}

describe('removeBook', () => {
  it('soft-deletes when the book exists and is active', async () => {
    const book = makeBook({ id: 'uuid-1', deletedAt: null })
    const repository = fakeRepository(book)

    await removeBook({ repository }, 'uuid-1')

    expect(repository.findById).toHaveBeenCalledWith('uuid-1')
    expect(repository.softDelete).toHaveBeenCalledTimes(1)
    expect(repository.softDelete).toHaveBeenCalledWith('uuid-1')
  })

  it('throws BookNotFoundError when the repository returns null', async () => {
    const repository = fakeRepository(null)

    await expect(removeBook({ repository }, 'missing-uuid')).rejects.toBeInstanceOf(
      BookNotFoundError,
    )
    expect(repository.softDelete).not.toHaveBeenCalled()
  })

  it('throws BookNotFoundError when the book is already soft-deleted', async () => {
    const book = makeBook({
      id: 'uuid-soft',
      deletedAt: new Date('2026-04-10T00:00:00Z'),
    })
    const repository = fakeRepository(book)

    await expect(removeBook({ repository }, 'uuid-soft')).rejects.toBeInstanceOf(BookNotFoundError)
    await expect(removeBook({ repository }, 'uuid-soft')).rejects.toMatchObject({
      code: 'BOOK_NOT_FOUND',
    })
    expect(repository.softDelete).not.toHaveBeenCalled()
  })
})
