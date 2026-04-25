import type { Chapter } from './Chapter'

export interface ChapterRepository {
  saveMany(chapters: readonly Chapter[]): Promise<void>
  listByBookId(bookId: string): Promise<Chapter[]>
  countByBookId(bookId: string): Promise<number>
  findById(chapterId: string): Promise<Chapter | null>
}
