import type { books } from '@dialogus/db/schema'
import type { Book } from '../../../domain/book/Book'

export type BookRow = typeof books.$inferSelect
export type BookInsert = typeof books.$inferInsert

export function toDomain(row: BookRow): Book {
  return {
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
  }
}

export function toPersistence(book: Book): BookInsert {
  return {
    id: book.id,
    gutendexId: book.gutendexId,
    title: book.title,
    authors: book.authors.map((author) => ({
      name: author.name,
      birthYear: author.birthYear,
      deathYear: author.deathYear,
    })),
    languages: [...book.languages],
    subjects: [...book.subjects],
    downloadUrlEpub: book.downloadUrlEpub,
    downloadUrlTxt: book.downloadUrlTxt,
    coverUrl: book.coverUrl,
    rawHash: book.rawHash,
    ingestionStatus: book.ingestionStatus,
    ingestionError: book.ingestionError,
    tags: [...book.tags],
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
    deletedAt: book.deletedAt,
  }
}
