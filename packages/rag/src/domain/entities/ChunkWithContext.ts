export interface ChunkWithContext {
  readonly chunkId: string
  readonly bookId: string
  readonly chapterId: string
  readonly chapterOrdinal: number
  readonly chapterTitle: string
  readonly text: string
  readonly excerptPreview: string
  readonly score: number
}
