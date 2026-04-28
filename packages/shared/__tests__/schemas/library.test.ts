import type { BookDto } from '@dialogus/shared/schemas/book'
import {
  type AddBookRequest,
  addBookRequestSchema,
  type BookResponse,
  bookResponseSchema,
  type ListLibraryQuery,
  type ListLibraryResponse,
  listLibraryQuerySchema,
  listLibraryResponseSchema,
} from '@dialogus/shared/schemas/library'
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

describe('addBookRequestSchema', () => {
  it('parses a numeric gutendex_id', () => {
    const result = addBookRequestSchema.safeParse({ gutendex_id: 996 })
    expect(result.success).toBe(true)
    if (result.success) {
      const parsed: AddBookRequest = result.data
      expect(parsed.gutendex_id).toBe(996)
    }
  })

  it('coerces a string gutendex_id to a number', () => {
    const result = addBookRequestSchema.safeParse({ gutendex_id: '996' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.gutendex_id).toBe(996)
      expect(typeof result.data.gutendex_id).toBe('number')
    }
  })

  it('rejects a non-numeric, non-coercible gutendex_id', () => {
    const result = addBookRequestSchema.safeParse({ gutendex_id: 'abc' })
    expect(result.success).toBe(false)
  })

  it('rejects a negative gutendex_id', () => {
    const result = addBookRequestSchema.safeParse({ gutendex_id: -1 })
    expect(result.success).toBe(false)
  })

  it('rejects a missing gutendex_id', () => {
    const result = addBookRequestSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('listLibraryQuerySchema', () => {
  it('parses an empty query (limit defaults to 32)', () => {
    const result = listLibraryQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      const parsed: ListLibraryQuery = result.data
      expect(parsed.limit).toBe(32)
      expect(parsed.cursor).toBeUndefined()
      expect(parsed.status).toBeUndefined()
      expect(parsed.include_deleted).toBeUndefined()
    }
  })

  it('coerces include_deleted="true" to boolean true', () => {
    const result = listLibraryQuerySchema.safeParse({ include_deleted: 'true' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.include_deleted).toBe(true)
    }
  })

  it('coerces include_deleted="false" to boolean false', () => {
    const result = listLibraryQuerySchema.safeParse({ include_deleted: 'false' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.include_deleted).toBe(false)
    }
  })

  it('rejects a non-string include_deleted (query layer always strings)', () => {
    const result = listLibraryQuerySchema.safeParse({ include_deleted: true })
    expect(result.success).toBe(false)
  })

  it('coerces limit string to number within bounds', () => {
    const result = listLibraryQuerySchema.safeParse({ limit: '5' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.limit).toBe(5)
  })

  it('rejects limit above 32', () => {
    const result = listLibraryQuerySchema.safeParse({ limit: 100 })
    expect(result.success).toBe(false)
  })

  it('accepts a known ingestion status filter', () => {
    const result = listLibraryQuerySchema.safeParse({ status: 'ready' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.status).toBe('ready')
  })

  it('rejects an unknown ingestion status filter', () => {
    const result = listLibraryQuerySchema.safeParse({ status: 'bogus' })
    expect(result.success).toBe(false)
  })

  it('rejects a language outside the en|pt enum', () => {
    const result = listLibraryQuerySchema.safeParse({ language: 'fr' })
    expect(result.success).toBe(false)
  })

  it('accepts cursor + status + language together', () => {
    const result = listLibraryQuerySchema.safeParse({
      cursor: 'b3BhcXVlLWN1cnNvcg==',
      status: 'ready',
      language: 'pt',
      include_deleted: 'false',
    })
    expect(result.success).toBe(true)
  })
})

describe('bookResponseSchema', () => {
  it('parses an envelope with a single book', () => {
    const response: BookResponse = { data: validBookDto }
    const result = bookResponseSchema.safeParse(response)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.data.id).toBe(VALID_BOOK_ID)
  })

  it('rejects a response missing data', () => {
    const result = bookResponseSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects a malformed book in data', () => {
    const result = bookResponseSchema.safeParse({
      data: { ...validBookDto, ingestion_status: 'bogus' },
    })
    expect(result.success).toBe(false)
  })
})

describe('listLibraryResponseSchema', () => {
  it('parses an envelope with data + meta + links', () => {
    const response: ListLibraryResponse = {
      data: [validBookDto],
      meta: { count: 1 },
      links: {
        self: '/api/library/books',
        next: '/api/library/books?cursor=next',
      },
    }
    const result = listLibraryResponseSchema.safeParse(response)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.data).toHaveLength(1)
      expect(result.data.meta.count).toBe(1)
    }
  })

  it('parses an empty list response', () => {
    const result = listLibraryResponseSchema.safeParse({ data: [], meta: { count: 0 } })
    expect(result.success).toBe(true)
  })

  it('rejects a response missing meta.count', () => {
    const result = listLibraryResponseSchema.safeParse({ data: [], meta: {} })
    expect(result.success).toBe(false)
  })
})
