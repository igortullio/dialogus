import type { Database } from '@dialogus/db'
import { schema } from '@dialogus/db'
import type { ChapterSummaryReadRepository, ChapterSummaryView } from '@dialogus/rag'
import { eq } from 'drizzle-orm'

const { chapters, chapterSummaries } = schema

interface ChapterSummaryRow {
  readonly bookId: string
  readonly chapterId: string
  readonly chapterOrdinal: number
  readonly chapterTitle: string
  readonly summary: string
  readonly tokenCount: number
  readonly model: string
  readonly generatedAt: Date
}

export class DialogusChapterSummaryReadAdapter implements ChapterSummaryReadRepository {
  constructor(private readonly db: Database) {}

  async findByChapterId(chapterId: string): Promise<ChapterSummaryView | null> {
    const [row] = (await this.db
      .select({
        bookId: chapterSummaries.bookId,
        chapterId: chapterSummaries.chapterId,
        chapterOrdinal: chapters.ordinal,
        chapterTitle: chapters.title,
        summary: chapterSummaries.summary,
        tokenCount: chapterSummaries.tokenCount,
        model: chapterSummaries.model,
        generatedAt: chapterSummaries.generatedAt,
      })
      .from(chapterSummaries)
      .innerJoin(chapters, eq(chapters.id, chapterSummaries.chapterId))
      .where(eq(chapterSummaries.chapterId, chapterId))
      .limit(1)) as ChapterSummaryRow[]
    return row ? { ...row } : null
  }
}
