import type { Database } from '@dialogus/db/client'
import { chapterSummaries, chapters } from '@dialogus/db/schema'
import { and, asc, eq, notExists } from 'drizzle-orm'
import type { ChapterSummary } from '../../domain/chapter_summary/ChapterSummary'
import type { ChapterSummaryRepository } from '../../domain/chapter_summary/ChapterSummaryRepository.port'
import { type ChapterSummaryRow, toDomain, toPersistence } from './mappers/ChapterSummaryMapper'

const SUMMARY_COLUMNS = {
  id: chapterSummaries.id,
  chapterId: chapterSummaries.chapterId,
  bookId: chapterSummaries.bookId,
  summary: chapterSummaries.summary,
  tokenCount: chapterSummaries.tokenCount,
  model: chapterSummaries.model,
  generatedAt: chapterSummaries.generatedAt,
} as const

export class DrizzleChapterSummaryRepository implements ChapterSummaryRepository {
  constructor(private readonly db: Database) {}

  async save(summary: ChapterSummary): Promise<ChapterSummary> {
    const row = toPersistence(summary)
    const { id: _id, ...updateFields } = row
    const [saved] = (await this.db
      .insert(chapterSummaries)
      .values(row)
      .onConflictDoUpdate({ target: chapterSummaries.chapterId, set: updateFields })
      .returning(SUMMARY_COLUMNS)) as ChapterSummaryRow[]
    if (!saved) {
      throw new Error(`save returned no row for chapter summary ${summary.id}`)
    }
    return toDomain(saved)
  }

  async findByChapterId(chapterId: string): Promise<ChapterSummary | null> {
    const [row] = (await this.db
      .select(SUMMARY_COLUMNS)
      .from(chapterSummaries)
      .where(eq(chapterSummaries.chapterId, chapterId))
      .limit(1)) as ChapterSummaryRow[]
    return row ? toDomain(row) : null
  }

  async listMissingChapterIds(bookId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: chapters.id })
      .from(chapters)
      .where(
        and(
          eq(chapters.bookId, bookId),
          notExists(
            this.db
              .select({ one: chapterSummaries.id })
              .from(chapterSummaries)
              .where(eq(chapterSummaries.chapterId, chapters.id)),
          ),
        ),
      )
      .orderBy(asc(chapters.ordinal))
    return rows.map((r) => r.id)
  }
}
