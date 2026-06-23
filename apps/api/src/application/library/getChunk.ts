import { BookNotFoundError, type LibraryEntryRepository } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { chapters, chunks } from '@dialogus/db/schema'
import type { ChunkReadDto } from '@dialogus/shared/schemas/ingestion'
import { eq } from 'drizzle-orm'
import { ChunkNotFoundError } from './errors'

export interface GetChunkDeps {
  readonly db: Database
  readonly libraryRepo: LibraryEntryRepository
}

export async function getChunk(
  deps: GetChunkDeps,
  userId: string,
  chunkId: string,
): Promise<ChunkReadDto> {
  const rows = await deps.db
    .select({
      chunk: chunks,
      chapter: {
        ordinal: chapters.ordinal,
        title: chapters.title,
      },
    })
    .from(chunks)
    .innerJoin(chapters, eq(chunks.chapterId, chapters.id))
    .where(eq(chunks.id, chunkId))
    .limit(1)

  const row = rows[0]
  if (!row) throw new ChunkNotFoundError(chunkId)

  // Authorize: the chunk's book must be in the user's active library before
  // returning text (FR-008 citation resolution); a non-member sees book-not-found
  // (don't leak another user's chunk — SC-002).
  const isMember = await deps.libraryRepo.isActiveMember(userId, row.chunk.bookId)
  if (!isMember) throw new BookNotFoundError(`Book ${row.chunk.bookId} not found`)

  return {
    id: row.chunk.id,
    book_id: row.chunk.bookId,
    chapter_id: row.chunk.chapterId,
    chapter_title: row.chapter.title,
    chapter_ordinal: row.chapter.ordinal,
    ordinal: row.chunk.ordinal,
    text: row.chunk.text,
    token_count: row.chunk.tokenCount,
    start_char: row.chunk.startChar,
    end_char: row.chunk.endChar,
  }
}
