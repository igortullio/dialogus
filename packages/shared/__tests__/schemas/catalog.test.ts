import type { BookDto } from '@dialogus/shared/schemas/book'
import {
  type SearchRequest,
  type SearchResponse,
  searchRequestSchema,
  searchResponseSchema,
} from '@dialogus/shared/schemas/catalog'
import { describe, expect, it } from 'vitest'

const VALID_BOOK_ID = '11111111-1111-4111-8111-111111111111'

const validBookDto: BookDto = {
  id: VALID_BOOK_ID,
  gutendex_id: 996,
  title: 'Don Quixote',
  authors: [{ name: 'Cervantes Saavedra, Miguel de', birth_year: 1547, death_year: 1616 }],
  languages: ['en'],
  subjects: [],
  download_url_epub: null,
  download_url_txt: null,
  cover_url: null,
  ingestion_status: 'discovered',
  ingestion_error: null,
  tags: [],
  created_at: '2026-04-25T15:30:00.000Z',
  updated_at: '2026-04-25T15:30:00.000Z',
  deleted_at: null,
}

describe('searchRequestSchema', () => {
  it('parses a request with all optional fields omitted (limit defaults to 32)', () => {
    const result = searchRequestSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      const parsed: SearchRequest = result.data
      expect(parsed.limit).toBe(32)
      expect(parsed.q).toBeUndefined()
      expect(parsed.language).toBeUndefined()
      expect(parsed.sort).toBeUndefined()
    }
  })

  it('coerces a string limit to a number', () => {
    const result = searchRequestSchema.safeParse({ language: 'en', limit: '10' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(10)
      expect(typeof result.data.limit).toBe('number')
    }
  })

  it('rejects a language outside the en|pt enum', () => {
    const result = searchRequestSchema.safeParse({ language: 'de' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'language')
      expect(issue).toBeDefined()
    }
  })

  it('rejects a sort outside the popular|ascending|descending enum', () => {
    const result = searchRequestSchema.safeParse({ sort: 'random' })
    expect(result.success).toBe(false)
  })

  it('rejects a limit below 1 or above 32', () => {
    expect(searchRequestSchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(searchRequestSchema.safeParse({ limit: 33 }).success).toBe(false)
  })

  it('accepts cursor + topic + sort together', () => {
    const result = searchRequestSchema.safeParse({
      q: 'don quixote',
      topic: 'fiction',
      sort: 'popular',
      cursor: 'b3BhcXVlLWN1cnNvcg==',
      limit: 16,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cursor).toBe('b3BhcXVlLWN1cnNvcg==')
      expect(result.data.sort).toBe('popular')
    }
  })

  it('strips unknown query parameters', () => {
    const result = searchRequestSchema.safeParse({ language: 'pt', _ignored: 'noise' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).not.toHaveProperty('_ignored')
  })
})

describe('searchResponseSchema', () => {
  it('parses an envelope with data + meta + links', () => {
    const response: SearchResponse = {
      data: [validBookDto],
      meta: { count: 1 },
      links: { next: '/api/catalog/search?cursor=abc', self: '/api/catalog/search' },
    }
    const result = searchResponseSchema.safeParse(response)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.data).toHaveLength(1)
      expect(result.data.meta.count).toBe(1)
      expect(result.data.links?.next).toContain('cursor=abc')
    }
  })

  it('parses an envelope with no links (links is optional)', () => {
    const result = searchResponseSchema.safeParse({
      data: [],
      meta: { count: 0 },
    })
    expect(result.success).toBe(true)
  })

  it('rejects a response missing meta.count', () => {
    const result = searchResponseSchema.safeParse({
      data: [],
      meta: {},
    })
    expect(result.success).toBe(false)
  })

  it('rejects a response with a malformed book in data', () => {
    const result = searchResponseSchema.safeParse({
      data: [{ ...validBookDto, gutendex_id: -1 }],
      meta: { count: 1 },
    })
    expect(result.success).toBe(false)
  })
})
