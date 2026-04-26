import type { Chapter } from './Chapter'

export interface ChapterRepository {
  saveMany(chapters: readonly Chapter[]): Promise<void>
  listByBookId(bookId: string): Promise<Chapter[]>
  streamByBookId(bookId: string): AsyncIterable<Chapter>
  countByBookId(bookId: string): Promise<number>
  findById(chapterId: string): Promise<Chapter | null>
}
