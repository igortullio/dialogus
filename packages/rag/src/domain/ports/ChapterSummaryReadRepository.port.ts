import type { ChapterSummaryView } from '../entities/ChapterSummaryView'

export interface ChapterSummaryReadRepository {
  findByChapterId(chapterId: string): Promise<ChapterSummaryView | null>
}
