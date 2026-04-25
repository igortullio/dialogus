import type {
  BookRepository,
  Cursor,
  ListFilter,
  ListResult,
} from '../domain/book/BookRepository.port'

export interface ListLibraryDeps {
  repository: BookRepository
}

export interface ListLibraryInput {
  filter: ListFilter
  cursor?: Cursor
  limit?: number
}

export function listLibrary(deps: ListLibraryDeps, input: ListLibraryInput): Promise<ListResult> {
  return deps.repository.list(input.filter, input.cursor, input.limit)
}
