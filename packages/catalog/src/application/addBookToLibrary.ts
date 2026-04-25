import { randomUUID } from 'node:crypto'
import type { Book } from '../domain/book/Book'
import { DuplicateBookError } from '../domain/book/BookError'
import type { BookRepository } from '../domain/book/BookRepository.port'
import type { GutendexBook, GutendexClient } from '../domain/book/GutendexClient.port'

export interface AddBookToLibraryDeps {
  repository: BookRepository
  client: GutendexClient
}

export async function addBookToLibrary(
  deps: AddBookToLibraryDeps,
  gutendexId: number,
): Promise<Book> {
  const existing = await deps.repository.findByGutendexId(gutendexId)
  if (existing) {
    throw buildDuplicateError(gutendexId, existing)
  }
  const dto = await deps.client.getBook(gutendexId)
  return deps.repository.save(toNewBook(dto))
}

function buildDuplicateError(gutendexId: number, existing: Book): DuplicateBookError {
  if (existing.deletedAt === null) {
    return new DuplicateBookError(
      `Gutendex ID ${gutendexId} is already in library as book ${existing.id}.`,
      { existingBookId: existing.id },
    )
  }
  return new DuplicateBookError(
    `Gutendex ID ${gutendexId} exists as soft-deleted book ${existing.id}. Use POST /api/library/books/${existing.id}/restore to restore it.`,
    { existingBookId: existing.id },
  )
}

function toNewBook(dto: GutendexBook): Book {
  const now = new Date()
  return {
    id: randomUUID(),
    gutendexId: dto.id,
    title: dto.title,
    authors: dto.authors.map((author) => ({
      name: author.name,
      birthYear: author.birthYear,
      deathYear: author.deathYear,
    })),
    languages: [...dto.languages],
    subjects: [...dto.subjects],
    downloadUrlEpub: dto.downloadUrlEpub,
    downloadUrlTxt: dto.downloadUrlTxt,
    coverUrl: dto.coverUrl,
    rawHash: null,
    ingestionStatus: 'discovered',
    ingestionError: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}
