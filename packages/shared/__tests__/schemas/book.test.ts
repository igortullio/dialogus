import {
  type BookDto,
  bookDtoSchema,
  type GutendexBook,
  gutendexBookSchema,
} from '@dialogus/shared/schemas/book'
import { describe, expect, it } from 'vitest'

const VALID_BOOK_ID = '11111111-1111-4111-8111-111111111111'

const validBookDto: BookDto = {
  id: VALID_BOOK_ID,
  gutendex_id: 996,
  title: 'Don Quixote',
  authors: [{ name: 'Cervantes Saavedra, Miguel de', birth_year: 1547, death_year: 1616 }],
  languages: ['en'],
  subjects: ['Knights and knighthood -- Spain -- Fiction'],
  download_url_epub: 'https://www.gutenberg.org/ebooks/996.epub.images',
  download_url_txt: 'https://www.gutenberg.org/files/996/996-0.txt',
  cover_url: 'https://www.gutenberg.org/cache/epub/996/pg996.cover.medium.jpg',
  ingestion_status: 'discovered',
  ingestion_error: null,
  tags: [],
  created_at: '2026-04-25T15:30:00.000Z',
  updated_at: '2026-04-25T15:30:00.000Z',
  deleted_at: null,
}

describe('bookDtoSchema', () => {
  it('parses a fully populated book DTO', () => {
    const result = bookDtoSchema.safeParse(validBookDto)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.gutendex_id).toBe(996)
      expect(result.data.authors).toHaveLength(1)
    }
  })

  it('parses a book with null download URLs and cover', () => {
    const result = bookDtoSchema.safeParse({
      ...validBookDto,
      download_url_epub: null,
      download_url_txt: null,
      cover_url: null,
    })
    expect(result.success).toBe(true)
  })

  it('parses a soft-deleted book with deleted_at set', () => {
    const result = bookDtoSchema.safeParse({
      ...validBookDto,
      deleted_at: '2026-04-26T10:00:00.000Z',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.deleted_at).toBe('2026-04-26T10:00:00.000Z')
  })

  it('rejects an invalid uuid for id', () => {
    const result = bookDtoSchema.safeParse({ ...validBookDto, id: 'not-a-uuid' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'id')
      expect(issue).toBeDefined()
    }
  })

  it('rejects an unknown ingestion_status value', () => {
    const result = bookDtoSchema.safeParse({ ...validBookDto, ingestion_status: 'bogus' })
    expect(result.success).toBe(false)
  })

  it('rejects a negative gutendex_id', () => {
    const result = bookDtoSchema.safeParse({ ...validBookDto, gutendex_id: -1 })
    expect(result.success).toBe(false)
  })

  it('rejects a non-iso created_at value', () => {
    const result = bookDtoSchema.safeParse({ ...validBookDto, created_at: 'yesterday' })
    expect(result.success).toBe(false)
  })

  it('strips unknown fields by default (tolerant strip mode)', () => {
    const result = bookDtoSchema.safeParse({
      ...validBookDto,
      _internal_note: 'extra',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).not.toHaveProperty('_internal_note')
  })

  it('strips raw_hash (internal-only — not part of the wire DTO)', () => {
    const result = bookDtoSchema.safeParse({
      ...validBookDto,
      raw_hash: 'sha256:deadbeef',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).not.toHaveProperty('raw_hash')
  })

  it('round-trips through JSON without loss', () => {
    const roundTripped = JSON.parse(JSON.stringify(validBookDto))
    const result = bookDtoSchema.safeParse(roundTripped)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual(validBookDto)
  })
})

const gutendexFixture: GutendexBook = {
  id: 996,
  title: 'Don Quixote',
  authors: [{ name: 'Cervantes Saavedra, Miguel de', birth_year: 1547, death_year: 1616 }],
  translators: [{ name: 'Ormsby, John', birth_year: 1829, death_year: 1895 }],
  subjects: ['Knights and knighthood -- Spain -- Fiction'],
  bookshelves: ['Best Books Ever Listings'],
  languages: ['en'],
  copyright: false,
  media_type: 'Text',
  formats: {
    'application/epub+zip': 'https://www.gutenberg.org/ebooks/996.epub.images',
    'text/plain; charset=us-ascii': 'https://www.gutenberg.org/files/996/996-0.txt',
    'image/jpeg': 'https://www.gutenberg.org/cache/epub/996/pg996.cover.medium.jpg',
  },
  download_count: 12345,
}

describe('gutendexBookSchema', () => {
  it('parses a fully populated raw Gutendex response', () => {
    const result = gutendexBookSchema.safeParse(gutendexFixture)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.formats['application/epub+zip']).toContain('996.epub.images')
      expect(result.data.translators).toHaveLength(1)
    }
  })

  it('parses a minimal valid response (only required fields)', () => {
    const result = gutendexBookSchema.safeParse({
      id: 1,
      title: 'X',
      authors: [],
      subjects: [],
      languages: [],
      formats: {},
    })
    expect(result.success).toBe(true)
  })

  it('rejects when required fields are missing', () => {
    const result = gutendexBookSchema.safeParse({ id: 1, title: 'X' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('authors')
      expect(paths).toContain('languages')
      expect(paths).toContain('subjects')
      expect(paths).toContain('formats')
    }
  })

  it('coerces a string id to number', () => {
    const result = gutendexBookSchema.safeParse({ ...gutendexFixture, id: '996' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.id).toBe(996)
  })

  it('strips unknown upstream fields without failing', () => {
    const result = gutendexBookSchema.safeParse({
      ...gutendexFixture,
      summaries: ['ignored'],
      future_field: { ignored: true },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty('summaries')
      expect(result.data).not.toHaveProperty('future_field')
    }
  })

  it('rejects a non-string download URL inside formats', () => {
    const result = gutendexBookSchema.safeParse({
      ...gutendexFixture,
      formats: { 'text/plain': 42 },
    })
    expect(result.success).toBe(false)
  })
})
