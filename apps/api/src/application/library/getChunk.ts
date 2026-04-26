import type { Database } from '@dialogus/db'
import { chapters, chunks } from '@dialogus/db/schema'
import type { ChunkReadDto } from '@dialogus/shared/schemas/ingestion'
import { eq } from 'drizzle-orm'
import { ChunkNotFoundError } from './errors'

export interface GetChunkDeps {
  readonly db: Database
}

export async function getChunk(deps: GetChunkDeps, chunkId: string): Promise<ChunkReadDto> {
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
