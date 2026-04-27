import type { chapterSummaries } from '@dialogus/db/schema'
import type { ChapterSummary } from '../../../domain/chapter_summary/ChapterSummary'

export type ChapterSummaryRow = typeof chapterSummaries.$inferSelect
export type ChapterSummaryInsert = typeof chapterSummaries.$inferInsert

export function toDomain(row: ChapterSummaryRow): ChapterSummary {
  return {
    id: row.id,
    chapterId: row.chapterId,
    bookId: row.bookId,
    summary: row.summary,
    tokenCount: row.tokenCount,
    model: row.model,
    generatedAt: row.generatedAt,
  }
}

export function toPersistence(summary: ChapterSummary): ChapterSummaryInsert {
  return {
    id: summary.id,
    chapterId: summary.chapterId,
    bookId: summary.bookId,
    summary: summary.summary,
    tokenCount: summary.tokenCount,
    model: summary.model,
    generatedAt: summary.generatedAt,
  }
}
