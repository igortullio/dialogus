export type { Book, BookAuthor } from './domain/book/Book'
export {
  BookNotFoundError,
  DuplicateBookError,
  GutendexUpstreamError,
} from './domain/book/BookError'
export type {
  BookRepository,
  Cursor,
  ListFilter,
  ListResult,
} from './domain/book/BookRepository.port'
export type {
  GutendexAuthor,
  GutendexBook,
  GutendexClient,
  GutendexLanguage,
  GutendexSearchQuery,
  GutendexSearchResult,
  GutendexSort,
} from './domain/book/GutendexClient.port'
export { INGESTION_STATUS_VALUES, type IngestionStatus } from './domain/book/IngestionStatus'
