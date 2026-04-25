import { describe, expect, it, vi } from 'vitest'
import { getBook } from '../../src/application/getBook'
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
    softDelete: vi.fn(),
    restore: vi.fn(),
  }
}

describe('getBook', () => {
  it('returns the book when found', async () => {
    const book = makeBook({ id: 'uuid-1' })
    const repository = fakeRepository(book)

    const result = await getBook({ repository }, 'uuid-1')

    expect(repository.findById).toHaveBeenCalledWith('uuid-1')
    expect(result).toBe(book)
  })

  it('returns a soft-deleted book when found', async () => {
    const deletedAt = new Date('2026-04-10T00:00:00Z')
    const book = makeBook({ id: 'uuid-2', deletedAt })
    const repository = fakeRepository(book)

    const result = await getBook({ repository }, 'uuid-2')

    expect(result.deletedAt).toBe(deletedAt)
  })

  it('throws BookNotFoundError when the repository returns null', async () => {
    const repository = fakeRepository(null)

    await expect(getBook({ repository }, 'missing-uuid')).rejects.toBeInstanceOf(BookNotFoundError)
    await expect(getBook({ repository }, 'missing-uuid')).rejects.toMatchObject({
      code: 'BOOK_NOT_FOUND',
    })
  })
})
