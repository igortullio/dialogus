import type { Cursor, ListFilter, ListResult } from '../domain/book/BookRepository.port'
import type { LibraryEntryRepository } from '../domain/libraryEntry/LibraryEntryRepository.port'

export interface ListLibraryDeps {
  libraryRepo: LibraryEntryRepository
}

export interface ListLibraryInput {
  filter: ListFilter
  cursor?: Cursor
  limit?: number
}

/**
 * List the user's library (JOIN `library_entries` → shared `books`), scoped to
 * the user and ordered by add time with a keyset cursor.
 */
export function listLibrary(
  deps: ListLibraryDeps,
  userId: string,
  input: ListLibraryInput,
): Promise<ListResult> {
  return deps.libraryRepo.listForUser(userId, input.filter, input.cursor, input.limit)
}
