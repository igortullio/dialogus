import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchGutendex } from '../../../src/lib/api/catalog'
import { GUTENDEX_BOOK, jsonResponse } from './_fixtures'

const BASE = 'http://api.test'
const fetchMock = vi.fn<typeof fetch>()
const originalEnv = process.env.NEXT_PUBLIC_API_URL

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  process.env.NEXT_PUBLIC_API_URL = BASE
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalEnv === undefined) delete process.env.NEXT_PUBLIC_API_URL
  else process.env.NEXT_PUBLIC_API_URL = originalEnv
})

describe('searchGutendex', () => {
  it('issues GET /api/catalog/search with the supplied query params', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [GUTENDEX_BOOK], meta: { count: 1 } }))
    await searchGutendex({ q: 'tolstoy', language: 'en' })
    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain(`${BASE}/api/catalog/search`)
    expect(url).toContain('q=tolstoy')
    expect(url).toContain('language=en')
  })

  it('returns books, meta.count, and parses cursor= from links.next', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [GUTENDEX_BOOK],
        meta: { count: 99 },
        links: { next: '/api/catalog/search?q=tolstoy&cursor=abc123' },
      }),
    )
    const result = await searchGutendex({ q: 'tolstoy' })
    expect(result.books).toEqual([GUTENDEX_BOOK])
    expect(result.count).toBe(99)
    expect(result.nextCursor).toBe('abc123')
  })

  it('returns nextCursor=null when links.next is absent', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], meta: { count: 0 } }))
    const result = await searchGutendex({})
    expect(result).toEqual({ books: [], nextCursor: null, count: 0 })
  })

  it('forwards optional sort + topic params', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], meta: { count: 0 } }))
    await searchGutendex({ topic: 'philosophy', sort: 'popular', limit: 20 })
    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain('topic=philosophy')
    expect(url).toContain('sort=popular')
    expect(url).toContain('limit=20')
  })
})
