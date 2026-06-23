import { describe, expect, it, vi } from 'vitest'
import { addBookToLibrary } from '../../src/application/addBookToLibrary'
import type { Book } from '../../src/domain/book/Book'
import { GutendexUpstreamError } from '../../src/domain/book/BookError'
import type { BookRepository } from '../../src/domain/book/BookRepository.port'
import type { GutendexBook, GutendexClient } from '../../src/domain/book/GutendexClient.port'
import type { LibraryEntryRepository } from '../../src/domain/libraryEntry/LibraryEntryRepository.port'

const USER = 'user-1'

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
    list: vi.fn(async () => ({ books: [], nextCursor: null, total: 0 })),
    softDelete: vi.fn(async () => undefined),
    restore: vi.fn(async () => existingBook()),
    ...overrides,
  }
}

function fakeLibraryRepo(overrides: Partial<LibraryEntryRepository> = {}): LibraryEntryRepository {
  return {
    upsertMembership: vi.fn(async () => undefined),
    isActiveMember: vi.fn(async () => true),
    softRemove: vi.fn(async () => true),
    restore: vi.fn(async () => true),
    listForUser: vi.fn(async () => ({ books: [], nextCursor: null, total: 0 })),
    countInFlight: vi.fn(async () => 0),
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
  it('on a new title fetches from Gutendex, maps to discovered, saves, and upserts membership', async () => {
    const dto = gutendexBook({ id: 996 })
    const repository = fakeRepository()
    const libraryRepo = fakeLibraryRepo()
    const client = fakeClient({ getBook: vi.fn(async () => dto) })

    const { book, needsIngestion } = await addBookToLibrary(
      { repository, libraryRepo, client },
      USER,
      996,
    )

    expect(repository.findByGutendexId).toHaveBeenCalledWith(996)
    expect(client.getBook).toHaveBeenCalledWith(996)
    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(libraryRepo.upsertMembership).toHaveBeenCalledWith(USER, book.id)
    expect(book.gutendexId).toBe(996)
    expect(book.title).toBe('Don Quixote')
    expect(book.ingestionStatus).toBe('discovered')
    expect(book.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(needsIngestion).toBe(true)
  })

  it('returns the book that repository.save returns (preserves DB-assigned timestamps)', async () => {
    const persistedAt = new Date('2026-04-25T12:00:00Z')
    const persisted = existingBook({
      id: 'persisted-uuid',
      createdAt: persistedAt,
      updatedAt: persistedAt,
    })
    const repository = fakeRepository({ save: vi.fn(async () => persisted) })
    const libraryRepo = fakeLibraryRepo()
    const client = fakeClient()

    const { book } = await addBookToLibrary({ repository, libraryRepo, client }, USER, 996)

    expect(book).toBe(persisted)
    expect(book.id).toBe('persisted-uuid')
  })

  it('is idempotent: an existing shared book is reused (no Gutendex fetch, no save) and membership upserted', async () => {
    const existing = existingBook({ id: 'shared-uuid' })
    const repository = fakeRepository({ findByGutendexId: vi.fn(async () => existing) })
    const libraryRepo = fakeLibraryRepo()
    const client = fakeClient()

    const { book, needsIngestion } = await addBookToLibrary(
      { repository, libraryRepo, client },
      USER,
      996,
    )

    expect(client.getBook).not.toHaveBeenCalled()
    expect(repository.save).not.toHaveBeenCalled()
    expect(libraryRepo.upsertMembership).toHaveBeenCalledWith(USER, 'shared-uuid')
    expect(book).toBe(existing)
    expect(needsIngestion).toBe(true)
  })

  it('instant re-add: an already-ingested shared title needs no ingestion (SC-003/004)', async () => {
    const ready = existingBook({ id: 'ready-uuid', ingestionStatus: 'ready' })
    const repository = fakeRepository({ findByGutendexId: vi.fn(async () => ready) })
    const libraryRepo = fakeLibraryRepo()
    const client = fakeClient()

    const { book, needsIngestion } = await addBookToLibrary(
      { repository, libraryRepo, client },
      USER,
      996,
    )

    expect(book).toBe(ready)
    expect(needsIngestion).toBe(false)
    expect(libraryRepo.upsertMembership).toHaveBeenCalledWith(USER, 'ready-uuid')
  })

  it('does not catch GutendexUpstreamError — it propagates and nothing is saved or joined', async () => {
    const upstream = new GutendexUpstreamError(503, 'gutendex unavailable')
    const repository = fakeRepository()
    const libraryRepo = fakeLibraryRepo()
    const client = fakeClient({
      getBook: vi.fn(async () => {
        throw upstream
      }),
    })

    await expect(addBookToLibrary({ repository, libraryRepo, client }, USER, 996)).rejects.toBe(
      upstream,
    )
    expect(repository.save).not.toHaveBeenCalled()
    expect(libraryRepo.upsertMembership).not.toHaveBeenCalled()
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
    const libraryRepo = fakeLibraryRepo()
    const client = fakeClient({ getBook: vi.fn(async () => dto) })

    await addBookToLibrary({ repository, libraryRepo, client }, USER, 1342)

    const saveMock = repository.save as ReturnType<typeof vi.fn>
    expect(saveMock).toHaveBeenCalledTimes(1)
    const saved = saveMock.mock.calls[0]?.[0] as Book | undefined
    expect(saved).toBeDefined()
    expect(saved?.gutendexId).toBe(1342)
    expect(saved?.title).toBe('Pride and Prejudice')
    expect(saved?.languages).toEqual(['en', 'pt'])
    expect(saved?.subjects).toEqual(['Romance'])
    expect(saved?.ingestionStatus).toBe('discovered')
    expect(saved?.tags).toEqual([])
    expect(saved?.deletedAt).toBeNull()
  })
})
