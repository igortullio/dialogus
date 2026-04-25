import type { Book } from './Book'
import type { IngestionStatus } from './IngestionStatus'

export interface ListFilter {
  status?: IngestionStatus
  language?: 'en' | 'pt'
  includeDeleted?: boolean
}

export interface Cursor {
  createdAt: Date
  id: string
}

export interface ListResult {
  books: Book[]
  nextCursor: Cursor | null
}

export interface BookRepository {
  save(book: Book): Promise<Book>
  findById(id: string): Promise<Book | null>
  findByGutendexId(gutendexId: number): Promise<Book | null>
  list(filter: ListFilter, cursor?: Cursor, limit?: number): Promise<ListResult>
  softDelete(id: string): Promise<void>
  restore(id: string): Promise<Book>
}
