export interface Chapter {
  readonly id: string
  readonly bookId: string
  readonly ordinal: number
  readonly title: string
  readonly plainText: string
  readonly tokenCount: number
  readonly createdAt: Date
}
