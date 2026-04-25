import type { Book } from '../domain/book/Book'
import { BookNotFoundError } from '../domain/book/BookError'
import type { BookRepository } from '../domain/book/BookRepository.port'

export interface GetBookDeps {
  repository: BookRepository
}

export async function getBook(deps: GetBookDeps, id: string): Promise<Book> {
  const book = await deps.repository.findById(id)
  if (!book) {
    throw new BookNotFoundError(`Book ${id} not found`)
  }
  return book
}
