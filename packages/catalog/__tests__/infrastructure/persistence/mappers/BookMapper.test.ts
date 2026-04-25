import { describe, expect, it } from 'vitest'
import type { Book } from '../../../../src/domain/book/Book'
import {
  type BookRow,
  toDomain,
  toPersistence,
} from '../../../../src/infrastructure/persistence/mappers/BookMapper'

const fixedCreated = new Date('2026-04-25T10:00:00.000Z')
const fixedUpdated = new Date('2026-04-25T10:01:00.000Z')
const fixedDeleted = new Date('2026-04-25T10:02:00.000Z')

function buildRow(overrides: Partial<BookRow> = {}): BookRow {
  return {
    id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
    gutendexId: 996,
    title: 'Don Quixote',
    authors: [{ name: 'Miguel de Cervantes', birthYear: 1547, deathYear: 1616 }],
    languages: ['en', 'es'],
    subjects: ['Don Quixote (Fictitious character) -- Fiction'],
    downloadUrlEpub: 'https://example.com/996.epub',
    downloadUrlTxt: 'https://example.com/996.txt',
    coverUrl: 'https://example.com/996.jpg',
    rawHash: 'sha256:abc',
    ingestionStatus: 'discovered',
    ingestionError: null,
    ingestionProgress: 0,
    ingestionLastStage: null,
    ingestionStartedAt: null,
    indexedAt: null,
    tags: [],
    createdAt: fixedCreated,
    updatedAt: fixedUpdated,
    deletedAt: null,
    ...overrides,
  }
}

describe('BookMapper.toDomain', () => {
  it('maps a fully-populated row to a Book entity preserving every field', () => {
    const row = buildRow()
    const book = toDomain(row)
    expect(book).toEqual({
      id: row.id,
      gutendexId: row.gutendexId,
      title: row.title,
      authors: row.authors,
      languages: row.languages,
      subjects: row.subjects,
      downloadUrlEpub: row.downloadUrlEpub,
      downloadUrlTxt: row.downloadUrlTxt,
      coverUrl: row.coverUrl,
      rawHash: row.rawHash,
      ingestionStatus: row.ingestionStatus,
      ingestionError: row.ingestionError,
      tags: row.tags,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    })
  })

  it('preserves null deletedAt', () => {
    const book = toDomain(buildRow({ deletedAt: null }))
    expect(book.deletedAt).toBeNull()
  })

  it('preserves a populated deletedAt timestamp for soft-deleted rows', () => {
    const book = toDomain(buildRow({ deletedAt: fixedDeleted }))
    expect(book.deletedAt).toEqual(fixedDeleted)
  })

  it('preserves the empty tags array default', () => {
    const book = toDomain(buildRow({ tags: [] }))
    expect(book.tags).toEqual([])
  })

  it('preserves nullable text columns as null when row carries null', () => {
    const book = toDomain(
      buildRow({
        downloadUrlEpub: null,
        downloadUrlTxt: null,
        coverUrl: null,
        rawHash: null,
        ingestionError: null,
      }),
    )
    expect(book.downloadUrlEpub).toBeNull()
    expect(book.downloadUrlTxt).toBeNull()
    expect(book.coverUrl).toBeNull()
    expect(book.rawHash).toBeNull()
    expect(book.ingestionError).toBeNull()
  })

  it('preserves authors with null birthYear/deathYear', () => {
    const book = toDomain(
      buildRow({ authors: [{ name: 'Anonymous', birthYear: null, deathYear: null }] }),
    )
    expect(book.authors).toEqual([{ name: 'Anonymous', birthYear: null, deathYear: null }])
  })

  it.each([
    'discovered',
    'downloading',
    'parsing',
    'chunking',
    'embedding',
    'ready',
    'failed',
  ] as const)('preserves ingestionStatus=%s', (status) => {
    const book = toDomain(buildRow({ ingestionStatus: status }))
    expect(book.ingestionStatus).toBe(status)
  })
})

describe('BookMapper.toPersistence', () => {
  it('produces a row whose round-trip via toDomain returns the input book', () => {
    const original: Book = {
      id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
      gutendexId: 996,
      title: 'Don Quixote',
      authors: [{ name: 'Cervantes', birthYear: 1547, deathYear: 1616 }],
      languages: ['en', 'es'],
      subjects: ['Don Quixote (Fictitious character) -- Fiction'],
      downloadUrlEpub: 'https://example.com/996.epub',
      downloadUrlTxt: 'https://example.com/996.txt',
      coverUrl: 'https://example.com/996.jpg',
      rawHash: 'sha256:abc',
      ingestionStatus: 'discovered',
      ingestionError: null,
      tags: [],
      createdAt: fixedCreated,
      updatedAt: fixedUpdated,
      deletedAt: null,
    }
    const row = toPersistence(original) as BookRow
    const roundTripped = toDomain(row)
    expect(roundTripped).toEqual(original)
  })

  it('round-trips a soft-deleted book with non-empty tags + multilingual languages', () => {
    const original: Book = {
      id: 'd2e8f1a7-4c5e-49b6-9b1a-1f2c3d4e5f60',
      gutendexId: 12345,
      title: 'Os Lusíadas',
      authors: [{ name: 'Luís de Camões', birthYear: 1524, deathYear: 1580 }],
      languages: ['pt'],
      subjects: ['Epic poetry, Portuguese'],
      downloadUrlEpub: null,
      downloadUrlTxt: 'https://example.com/12345.txt',
      coverUrl: null,
      rawHash: 'sha256:def',
      ingestionStatus: 'ready',
      ingestionError: null,
      tags: ['classic', 'portuguese-canon'],
      createdAt: fixedCreated,
      updatedAt: fixedUpdated,
      deletedAt: fixedDeleted,
    }
    const roundTripped = toDomain(toPersistence(original) as BookRow)
    expect(roundTripped).toEqual(original)
  })

  it('round-trips a book that hit failed ingestion with an error message', () => {
    const original: Book = {
      id: 'e4f6a8c0-1234-4567-89ab-cdef01234567',
      gutendexId: 7777,
      title: 'Broken',
      authors: [],
      languages: ['en'],
      subjects: [],
      downloadUrlEpub: null,
      downloadUrlTxt: null,
      coverUrl: null,
      rawHash: null,
      ingestionStatus: 'failed',
      ingestionError: 'parse error: unexpected token',
      tags: [],
      createdAt: fixedCreated,
      updatedAt: fixedUpdated,
      deletedAt: null,
    }
    const roundTripped = toDomain(toPersistence(original) as BookRow)
    expect(roundTripped).toEqual(original)
  })

  it('returns a fresh authors array (defensive copy of jsonb payload)', () => {
    const original: Book = {
      id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
      gutendexId: 1,
      title: 't',
      authors: [{ name: 'A', birthYear: null, deathYear: null }],
      languages: [],
      subjects: [],
      downloadUrlEpub: null,
      downloadUrlTxt: null,
      coverUrl: null,
      rawHash: null,
      ingestionStatus: 'discovered',
      ingestionError: null,
      tags: [],
      createdAt: fixedCreated,
      updatedAt: fixedUpdated,
      deletedAt: null,
    }
    const row = toPersistence(original)
    expect(row.authors).not.toBe(original.authors)
    expect(row.authors).toEqual(original.authors)
  })
})
