import type { Book } from '../domain/book/Book'
import { BookNotFoundError } from '../domain/book/BookError'
import type { BookRepository } from '../domain/book/BookRepository.port'
import type { LibraryEntryRepository } from '../domain/libraryEntry/LibraryEntryRepository.port'

export interface RestoreBookDeps {
  repository: BookRepository
  libraryRepo: LibraryEntryRepository
}

/**
 * Restore a previously removed membership for the user. Resolves to
 * `BookNotFoundError` when the user has no membership row for the book (nothing
 * to restore — never leak the shared corpus' existence).
 */
export async function restoreBook(
  deps: RestoreBookDeps,
  userId: string,
  id: string,
): Promise<Book> {
  const restored = await deps.libraryRepo.restore(userId, id)
  if (!restored) {
    throw new BookNotFoundError(`Book ${id} not found`)
  }
  const book = await deps.repository.findById(id)
  if (!book) {
    throw new BookNotFoundError(`Book ${id} not found`)
  }
  return book
}
