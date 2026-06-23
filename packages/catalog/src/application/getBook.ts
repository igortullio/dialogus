import type { Book } from '../domain/book/Book'
import { BookNotFoundError } from '../domain/book/BookError'
import type { BookRepository } from '../domain/book/BookRepository.port'
import type { LibraryEntryRepository } from '../domain/libraryEntry/LibraryEntryRepository.port'

export interface GetBookDeps {
  repository: BookRepository
  libraryRepo: LibraryEntryRepository
}

/**
 * Read a book the user has in their active library. A non-member (or cross-user)
 * id resolves to `BookNotFoundError` — never leak the shared corpus' existence
 * (SC-002).
 */
export async function getBook(deps: GetBookDeps, userId: string, id: string): Promise<Book> {
  const isMember = await deps.libraryRepo.isActiveMember(userId, id)
  if (!isMember) {
    throw new BookNotFoundError(`Book ${id} not found`)
  }
  const book = await deps.repository.findById(id)
  if (!book) {
    throw new BookNotFoundError(`Book ${id} not found`)
  }
  return book
}
