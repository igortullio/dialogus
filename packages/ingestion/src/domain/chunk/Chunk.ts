export interface Chunk {
  readonly id: string
  readonly bookId: string
  readonly chapterId: string
  readonly ordinal: number
  readonly text: string
  readonly tokenCount: number
  readonly startChar: number
  readonly endChar: number
  readonly embedding: readonly number[] | null
  readonly createdAt: Date
}
