import { describe, expect, it, vi } from 'vitest'
import { searchGutendex } from '../../src/application/searchGutendex'
import { GutendexUpstreamError } from '../../src/domain/book/BookError'
import type {
  GutendexBook,
  GutendexClient,
  GutendexSearchQuery,
  GutendexSearchResult,
} from '../../src/domain/book/GutendexClient.port'

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

function fakeClient(result: GutendexSearchResult): GutendexClient {
  return {
    search: vi.fn(async () => result),
    getBook: vi.fn(async () => gutendexBook()),
  }
}

describe('searchGutendex', () => {
  it('returns mapped books, nextPage, and count from the client', async () => {
    const client = fakeClient({
      books: [gutendexBook({ id: 996 }), gutendexBook({ id: 1342, title: 'Pride and Prejudice' })],
      nextPage: 'https://gutendex.com/books?page=2',
      count: 2,
    })

    const result = await searchGutendex({ client }, { q: 'Moby Dick' })

    expect(result.count).toBe(2)
    expect(result.nextPage).toBe('https://gutendex.com/books?page=2')
    expect(result.books).toHaveLength(2)
    const first = result.books[0]
    expect(first?.gutendexId).toBe(996)
    expect(first?.title).toBe('Don Quixote')
    expect(first?.authors[0]?.name).toBe('Cervantes')
    expect(first?.languages).toEqual(['en'])
    expect(first?.downloadUrlEpub).toBe('https://example.com/996.epub')
    expect(client.search).toHaveBeenCalledWith({ q: 'Moby Dick' })
  })

  it('passes limit through to the client unchanged', async () => {
    const client = fakeClient({ books: [], nextPage: null, count: 0 })

    await searchGutendex({ client }, { q: 'x', limit: 10 })

    expect(client.search).toHaveBeenCalledWith({ q: 'x', limit: 10 })
  })

  it('forwards every supported query field to the client', async () => {
    const client = fakeClient({ books: [], nextPage: null, count: 0 })

    const query: GutendexSearchQuery = {
      q: 'whale',
      languages: ['en', 'pt'],
      topic: 'maritime',
      sort: 'popular',
      page: 3,
      limit: 5,
    }
    await searchGutendex({ client }, query)

    expect(client.search).toHaveBeenCalledWith(query)
  })

  it('returns an empty list when the client returns no books', async () => {
    const client = fakeClient({ books: [], nextPage: null, count: 0 })

    const result = await searchGutendex({ client }, { q: 'no-match' })

    expect(result.books).toEqual([])
    expect(result.nextPage).toBeNull()
    expect(result.count).toBe(0)
  })

  it('does not catch GutendexUpstreamError — it propagates to the caller', async () => {
    const upstream = new GutendexUpstreamError(503, 'gutendex unavailable')
    const client: GutendexClient = {
      search: vi.fn(async () => {
        throw upstream
      }),
      getBook: vi.fn(async () => gutendexBook()),
    }

    await expect(searchGutendex({ client }, { q: 'x' })).rejects.toBe(upstream)
  })

  it('omits local-state fields (id, ingestionStatus, ingestionError, tags, timestamps)', async () => {
    const client = fakeClient({
      books: [gutendexBook({ id: 42 })],
      nextPage: null,
      count: 1,
    })

    const result = await searchGutendex({ client }, {})
    const book = result.books[0] as Record<string, unknown> | undefined

    expect(book).toBeDefined()
    expect(book?.id).toBeUndefined()
    expect(book?.ingestionStatus).toBeUndefined()
    expect(book?.ingestionError).toBeUndefined()
    expect(book?.tags).toBeUndefined()
    expect(book?.createdAt).toBeUndefined()
    expect(book?.updatedAt).toBeUndefined()
    expect(book?.deletedAt).toBeUndefined()
    expect(book?.rawHash).toBeUndefined()
  })
})
