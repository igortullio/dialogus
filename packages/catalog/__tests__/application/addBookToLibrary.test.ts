import { describe, expect, it, vi } from 'vitest'
import { addBookToLibrary } from '../../src/application/addBookToLibrary'
import type { Book } from '../../src/domain/book/Book'
import { DuplicateBookError, GutendexUpstreamError } from '../../src/domain/book/BookError'
import type { BookRepository } from '../../src/domain/book/BookRepository.port'
import type { GutendexBook, GutendexClient } from '../../src/domain/book/GutendexClient.port'

function gutendexBook(overrides: Partial<GutendexBook> = {}): GutendexBook {
  return {
    id: 996,
    title: 'Don Quixote',
    authors: [{ name: 'Cervantes', birthYear: 1547, deathYear: 1616 }],
    languages: ['en'],
    subjects: ['Fiction'],
    downloadUrlEpub: 'https://example.com/996.epub',
    downloadUrlTxt: 'https://example.com/996.txt',
    coverUrl: 'https://example.com/996.jpg',
    ...overrides,
  }
}

function existingBook(overrides: Partial<Book> = {}): Book {
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

function fakeRepository(overrides: Partial<BookRepository> = {}): BookRepository {
  return {
    save: vi.fn(async (book: Book) => book),
    findById: vi.fn(async () => null),
    findByGutendexId: vi.fn(async () => null),
    list: vi.fn(async () => ({ books: [], nextCursor: null })),
    softDelete: vi.fn(async () => undefined),
    restore: vi.fn(async () => existingBook()),
    ...overrides,
  }
}

function fakeClient(overrides: Partial<GutendexClient> = {}): GutendexClient {
  return {
    search: vi.fn(async () => ({ books: [], nextPage: null, count: 0 })),
    getBook: vi.fn(async () => gutendexBook()),
    ...overrides,
  }
}

describe('addBookToLibrary', () => {
  it('on empty repo fetches from Gutendex, maps to discovered, and saves', async () => {
    const dto = gutendexBook({ id: 996 })
    const repository = fakeRepository()
    const client = fakeClient({ getBook: vi.fn(async () => dto) })

    const result = await addBookToLibrary({ repository, client }, 996)

    expect(repository.findByGutendexId).toHaveBeenCalledWith(996)
    expect(client.getBook).toHaveBeenCalledWith(996)
    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(result.gutendexId).toBe(996)
    expect(result.title).toBe('Don Quixote')
    expect(result.ingestionStatus).toBe('discovered')
    expect(result.ingestionError).toBeNull()
    expect(result.deletedAt).toBeNull()
    expect(result.tags).toEqual([])
    expect(result.rawHash).toBeNull()
    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('returns the book that the repository.save returns (preserves DB-assigned timestamps)', async () => {
    const persistedAt = new Date('2026-04-25T12:00:00Z')
    const dto = gutendexBook({ id: 996 })
    const persisted = existingBook({
      id: 'persisted-uuid',
      createdAt: persistedAt,
      updatedAt: persistedAt,
    })
    const repository = fakeRepository({ save: vi.fn(async () => persisted) })
    const client = fakeClient({ getBook: vi.fn(async () => dto) })

    const result = await addBookToLibrary({ repository, client }, 996)

    expect(result).toBe(persisted)
    expect(result.id).toBe('persisted-uuid')
  })

  it('throws DuplicateBookError with existingBookId when an active book exists', async () => {
    const existing = existingBook({ id: 'active-uuid', deletedAt: null })
    const repository = fakeRepository({ findByGutendexId: vi.fn(async () => existing) })
    const client = fakeClient()

    await expect(addBookToLibrary({ repository, client }, 996)).rejects.toMatchObject({
      name: 'DuplicateBookError',
      code: 'DUPLICATE_GUTENDEX_ID',
      existingBookId: 'active-uuid',
    })
    expect(client.getBook).not.toHaveBeenCalled()
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('throws DuplicateBookError instance when an active book exists', async () => {
    const existing = existingBook({ id: 'active-uuid', deletedAt: null })
    const repository = fakeRepository({ findByGutendexId: vi.fn(async () => existing) })
    const client = fakeClient()

    await expect(addBookToLibrary({ repository, client }, 996)).rejects.toBeInstanceOf(
      DuplicateBookError,
    )
  })

  it('throws DuplicateBookError pointing at /restore when an existing book is soft-deleted', async () => {
    const existing = existingBook({
      id: 'soft-uuid',
      deletedAt: new Date('2026-04-10T00:00:00Z'),
    })
    const repository = fakeRepository({ findByGutendexId: vi.fn(async () => existing) })
    const client = fakeClient()

    let captured: unknown
    try {
      await addBookToLibrary({ repository, client }, 996)
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(DuplicateBookError)
    const err = captured as DuplicateBookError
    expect(err.existingBookId).toBe('soft-uuid')
    expect(err.message).toContain('/restore')
    expect(err.message).toContain('soft-uuid')
    expect(client.getBook).not.toHaveBeenCalled()
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('does not catch GutendexUpstreamError — it propagates to the caller', async () => {
    const upstream = new GutendexUpstreamError(503, 'gutendex unavailable')
    const repository = fakeRepository()
    const client = fakeClient({
      getBook: vi.fn(async () => {
        throw upstream
      }),
    })

    await expect(addBookToLibrary({ repository, client }, 996)).rejects.toBe(upstream)
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('passes the persisted Book shape through to repository.save', async () => {
    const dto = gutendexBook({
      id: 1342,
      title: 'Pride and Prejudice',
      languages: ['en', 'pt'],
      subjects: ['Romance'],
      downloadUrlEpub: null,
      downloadUrlTxt: null,
      coverUrl: null,
    })
    const repository = fakeRepository()
    const client = fakeClient({ getBook: vi.fn(async () => dto) })

    await addBookToLibrary({ repository, client }, 1342)

    const saveMock = repository.save as ReturnType<typeof vi.fn>
    expect(saveMock).toHaveBeenCalledTimes(1)
    const saved = saveMock.mock.calls[0]?.[0] as Book | undefined
    expect(saved).toBeDefined()
    expect(saved?.gutendexId).toBe(1342)
    expect(saved?.title).toBe('Pride and Prejudice')
    expect(saved?.languages).toEqual(['en', 'pt'])
    expect(saved?.subjects).toEqual(['Romance'])
    expect(saved?.downloadUrlEpub).toBeNull()
    expect(saved?.downloadUrlTxt).toBeNull()
    expect(saved?.coverUrl).toBeNull()
    expect(saved?.ingestionStatus).toBe('discovered')
    expect(saved?.tags).toEqual([])
    expect(saved?.deletedAt).toBeNull()
  })
})
