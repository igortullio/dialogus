import { describe, expect, it } from 'vitest'
import type { Book, BookAuthor } from '../../../src/domain/book/Book'
import type {
  BookRepository,
  Cursor,
  ListFilter,
} from '../../../src/domain/book/BookRepository.port'
import type {
  GutendexBook,
  GutendexClient,
  GutendexSearchQuery,
} from '../../../src/domain/book/GutendexClient.port'
import {
  INGESTION_STATUS_VALUES,
  type IngestionStatus,
} from '../../../src/domain/book/IngestionStatus'

describe('Book domain types', () => {
  it('IngestionStatus accepts every canonical value', () => {
    const seen: IngestionStatus[] = [
      'discovered',
      'downloading',
      'cleaning',
      'parsing',
      'chunking',
      'summarizing',
      'embedding',
      'indexing',
      'ready',
      'failed',
    ]
    expect(seen).toEqual([...INGESTION_STATUS_VALUES])
  })

  it('Book entity literal type-checks against the techspec shape', () => {
    const author: BookAuthor = { name: 'Cervantes', birthYear: 1547, deathYear: 1616 }
    const book: Book = {
      id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
      gutendexId: 996,
      title: 'Don Quixote',
      authors: [author],
      languages: ['en'],
      subjects: [],
      downloadUrlEpub: null,
      downloadUrlTxt: null,
      coverUrl: null,
      rawHash: null,
      ingestionStatus: 'discovered',
      ingestionError: null,
      tags: [],
      createdAt: new Date(0),
      updatedAt: new Date(0),
      deletedAt: null,
    }
    expect(book.gutendexId).toBe(996)
  })
})

describe('Domain ports compile against fake adapters', () => {
  it('BookRepository contract is satisfiable by an in-memory stub', () => {
    const fakeRepo: BookRepository = {
      save: async (b) => b,
      findById: async () => null,
      findByGutendexId: async () => null,
      list: async (_filter: ListFilter, _cursor?: Cursor, _limit?: number) => ({
        books: [],
        nextCursor: null,
        total: 0,
      }),
      softDelete: async () => undefined,
      restore: async () => {
        throw new Error('unimplemented stub')
      },
    }
    expect(fakeRepo).toBeTypeOf('object')
  })

  it('GutendexClient contract is satisfiable by an in-memory stub', () => {
    const fakeBook: GutendexBook = {
      id: 996,
      title: 'Don Quixote',
      authors: [],
      languages: ['en'],
      subjects: [],
      downloadUrlEpub: null,
      downloadUrlTxt: null,
      coverUrl: null,
    }
    const fakeClient: GutendexClient = {
      search: async (_q: GutendexSearchQuery) => ({ books: [fakeBook], nextPage: null, count: 1 }),
      getBook: async () => fakeBook,
    }
    expect(fakeClient).toBeTypeOf('object')
  })
})
