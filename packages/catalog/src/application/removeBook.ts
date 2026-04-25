import { BookNotFoundError } from '../domain/book/BookError'
import type { BookRepository } from '../domain/book/BookRepository.port'

export interface RemoveBookDeps {
  repository: BookRepository
}

export async function removeBook(deps: RemoveBookDeps, id: string): Promise<void> {
  const existing = await deps.repository.findById(id)
  if (!existing || existing.deletedAt !== null) {
    throw new BookNotFoundError(`Book ${id} not found`)
  }
  await deps.repository.softDelete(id)
}
