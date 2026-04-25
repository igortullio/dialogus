import type { Book } from '../domain/book/Book'
import { BookNotFoundError } from '../domain/book/BookError'
import type { BookRepository } from '../domain/book/BookRepository.port'

export interface RestoreBookDeps {
  repository: BookRepository
}

export async function restoreBook(deps: RestoreBookDeps, id: string): Promise<Book> {
  const existing = await deps.repository.findById(id)
  if (!existing) {
    throw new BookNotFoundError(`Book ${id} not found`)
  }
  return deps.repository.restore(id)
}
