import type { ChapterSummary } from './ChapterSummary'

export interface ChapterSummaryRepository {
  save(summary: ChapterSummary): Promise<ChapterSummary>
  findByChapterId(chapterId: string): Promise<ChapterSummary | null>
  listMissingChapterIds(bookId: string): Promise<string[]>
}
