import { BookNotFoundError } from '../domain/book/BookError'
import type { LibraryEntryRepository } from '../domain/libraryEntry/LibraryEntryRepository.port'

export interface RemoveBookDeps {
  libraryRepo: LibraryEntryRepository
}

/**
 * Remove a title from the user's library (soft-remove the membership only; never
 * touches the shared `books` row — FR-013). Removing a title the user does not
 * actively have resolves to `BookNotFoundError`.
 */
export async function removeBook(deps: RemoveBookDeps, userId: string, id: string): Promise<void> {
  const removed = await deps.libraryRepo.softRemove(userId, id)
  if (!removed) {
    throw new BookNotFoundError(`Book ${id} not found`)
  }
}
