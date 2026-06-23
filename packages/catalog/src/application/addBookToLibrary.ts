import { randomUUID } from 'node:crypto'
import type { Book } from '../domain/book/Book'
import type { BookRepository } from '../domain/book/BookRepository.port'
import type { GutendexBook, GutendexClient } from '../domain/book/GutendexClient.port'
import type { LibraryEntryRepository } from '../domain/libraryEntry/LibraryEntryRepository.port'

export interface AddBookToLibraryDeps {
  repository: BookRepository
  libraryRepo: LibraryEntryRepository
  client: GutendexClient
}

export interface AddBookToLibraryResult {
  /** The shared corpus book (resolved or newly created). */
  book: Book
  /** True when the shared book still needs ingestion (`discovered`). */
  needsIngestion: boolean
}

/**
 * Add a title to the user's library over the shared corpus. Idempotent:
 * resolve-or-create the shared book by `gutendex_id`, then upsert the user's
 * membership (insert or clear a prior soft-remove). Re-adding an already-ingested
 * title is instant (no enqueue) — the caller decides whether to ingest via
 * `needsIngestion`. There is no `DuplicateBookError` anymore: adding is a no-op
 * success for an active member and a restore for a removed one.
 */
export async function addBookToLibrary(
  deps: AddBookToLibraryDeps,
  userId: string,
  gutendexId: number,
): Promise<AddBookToLibraryResult> {
  let book = await deps.repository.findByGutendexId(gutendexId)
  if (!book) {
    const dto = await deps.client.getBook(gutendexId)
    try {
      book = await deps.repository.save(toNewBook(dto))
    } catch (err) {
      // Concurrent first-add: another request created the shared book between our
      // findByGutendexId and save (gutendex_id is UNIQUE). Resolve to the winner
      // so exactly one shared book exists and both users get a membership (FR-012).
      const refetched = await deps.repository.findByGutendexId(gutendexId)
      if (!refetched) throw err
      book = refetched
    }
  }

  await deps.libraryRepo.upsertMembership(userId, book.id)

  return { book, needsIngestion: book.ingestionStatus === 'discovered' }
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
