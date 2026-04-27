export interface ChapterSummaryView {
  readonly bookId: string
  readonly chapterId: string
  readonly chapterOrdinal: number
  readonly chapterTitle: string
  readonly summary: string
  readonly tokenCount: number
  readonly model: string
  readonly generatedAt: Date
}
