import type { ChapterView } from '../entities/ChapterView'

export interface ChapterReadRepository {
  listByBook(bookId: string): Promise<ChapterView[]>
  findById(id: string): Promise<ChapterView | null>
}
