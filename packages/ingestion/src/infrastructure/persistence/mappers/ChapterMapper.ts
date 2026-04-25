import type { chapters } from '@dialogus/db/schema'
import type { Chapter } from '../../../domain/chapter/Chapter'

export type ChapterRow = typeof chapters.$inferSelect
export type ChapterInsert = typeof chapters.$inferInsert

export function toDomain(row: ChapterRow): Chapter {
  return {
    id: row.id,
    bookId: row.bookId,
    ordinal: row.ordinal,
    title: row.title,
    plainText: row.plainText,
    tokenCount: row.tokenCount,
    createdAt: row.createdAt,
  }
}

export function toPersistence(chapter: Chapter): ChapterInsert {
  return {
    id: chapter.id,
    bookId: chapter.bookId,
    ordinal: chapter.ordinal,
    title: chapter.title,
    plainText: chapter.plainText,
    tokenCount: chapter.tokenCount,
    createdAt: chapter.createdAt,
  }
}
