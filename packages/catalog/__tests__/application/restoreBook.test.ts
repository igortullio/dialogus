import { describe, expect, it, vi } from 'vitest'
import { restoreBook } from '../../src/application/restoreBook'
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

function fakeRepository(found: Book | null, restored?: Book): BookRepository {
  return {
    save: vi.fn(),
    findById: vi.fn(async () => found),
    findByGutendexId: vi.fn(),
    list: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(async () => {
      if (!restored) {
        throw new BookNotFoundError('not found')
      }
      return restored
    }),
  }
}

describe('restoreBook', () => {
  it('restores a soft-deleted book and returns the restored entity', async () => {
    const softDeleted = makeBook({
      id: 'uuid-soft',
      deletedAt: new Date('2026-04-10T00:00:00Z'),
    })
    const restored = makeBook({ id: 'uuid-soft', deletedAt: null })
    const repository = fakeRepository(softDeleted, restored)

    const out = await restoreBook({ repository }, 'uuid-soft')

    expect(repository.findById).toHaveBeenCalledWith('uuid-soft')
    expect(repository.restore).toHaveBeenCalledWith('uuid-soft')
    expect(out).toBe(restored)
    expect(out.deletedAt).toBeNull()
  })

  it('also calls restore for an already-active book (restore is idempotent at the port)', async () => {
    const active = makeBook({ id: 'uuid-active', deletedAt: null })
    const repository = fakeRepository(active, active)

    const out = await restoreBook({ repository }, 'uuid-active')

    expect(repository.restore).toHaveBeenCalledWith('uuid-active')
    expect(out).toBe(active)
  })

  it('throws BookNotFoundError when the book does not exist', async () => {
    const repository = fakeRepository(null)

    await expect(restoreBook({ repository }, 'missing-uuid')).rejects.toBeInstanceOf(
      BookNotFoundError,
    )
    expect(repository.restore).not.toHaveBeenCalled()
  })
})
