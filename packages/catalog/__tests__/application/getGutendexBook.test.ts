import { describe, expect, it, vi } from 'vitest'
import { getGutendexBook } from '../../src/application/getGutendexBook'
import { GutendexUpstreamError } from '../../src/domain/book/BookError'
import type { GutendexBook, GutendexClient } from '../../src/domain/book/GutendexClient.port'

function gutendexBook(overrides: Partial<GutendexBook> = {}): GutendexBook {
  return {
    id: 15,
    title: 'Moby Dick',
    authors: [{ name: 'Melville, Herman', birthYear: 1819, deathYear: 1891 }],
    languages: ['en'],
    subjects: ['Whaling — Fiction'],
    downloadUrlEpub: 'https://example.com/15.epub',
    downloadUrlTxt: 'https://example.com/15.txt',
    coverUrl: 'https://example.com/15.jpg',
    ...overrides,
  }
}

function fakeClient(book: GutendexBook): GutendexClient {
  return {
    search: vi.fn(async () => ({ books: [], nextPage: null, count: 0 })),
    getBook: vi.fn(async () => book),
  }
}

describe('getGutendexBook', () => {
  it('returns a mapped book without local state fields', async () => {
    const client = fakeClient(gutendexBook())

    const result = await getGutendexBook({ client }, 15)

    expect(client.getBook).toHaveBeenCalledWith(15)
    expect(result.gutendexId).toBe(15)
    expect(result.title).toBe('Moby Dick')
    expect(result.authors).toEqual([{ name: 'Melville, Herman', birthYear: 1819, deathYear: 1891 }])
    expect(result.languages).toEqual(['en'])
    expect(result.subjects).toEqual(['Whaling — Fiction'])
    expect(result.downloadUrlEpub).toBe('https://example.com/15.epub')

    const asRecord = result as Record<string, unknown>
    expect(asRecord.id).toBeUndefined()
    expect(asRecord.ingestionStatus).toBeUndefined()
    expect(asRecord.ingestionError).toBeUndefined()
    expect(asRecord.tags).toBeUndefined()
    expect(asRecord.createdAt).toBeUndefined()
    expect(asRecord.updatedAt).toBeUndefined()
    expect(asRecord.deletedAt).toBeUndefined()
    expect(asRecord.rawHash).toBeUndefined()
  })

  it('preserves null download URLs and cover when the upstream omits them', async () => {
    const client = fakeClient(
      gutendexBook({ downloadUrlEpub: null, downloadUrlTxt: null, coverUrl: null }),
    )

    const result = await getGutendexBook({ client }, 15)

    expect(result.downloadUrlEpub).toBeNull()
    expect(result.downloadUrlTxt).toBeNull()
    expect(result.coverUrl).toBeNull()
  })

  it('does not catch GutendexUpstreamError — it propagates to the caller', async () => {
    const upstream = new GutendexUpstreamError(404, 'not found')
    const client: GutendexClient = {
      search: vi.fn(async () => ({ books: [], nextPage: null, count: 0 })),
      getBook: vi.fn(async () => {
        throw upstream
      }),
    }

    await expect(getGutendexBook({ client }, 999)).rejects.toBe(upstream)
  })
})
