export interface ChapterSummary {
  readonly id: string
  readonly chapterId: string
  readonly bookId: string
  readonly summary: string
  readonly tokenCount: number
  readonly model: string
  readonly generatedAt: Date
}
