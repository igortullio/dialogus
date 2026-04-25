import type { chunks } from '@dialogus/db/schema'
import type { Chunk } from '../../../domain/chunk/Chunk'

export type ChunkRow = typeof chunks.$inferSelect
export type ChunkInsert = typeof chunks.$inferInsert

export function toDomain(row: ChunkRow): Chunk {
  return {
    id: row.id,
    bookId: row.bookId,
    chapterId: row.chapterId,
    ordinal: row.ordinal,
    text: row.text,
    tokenCount: row.tokenCount,
    startChar: row.startChar,
    endChar: row.endChar,
    embedding: row.embedding === null ? null : [...row.embedding],
    createdAt: row.createdAt,
  }
}

export function toPersistence(chunk: Chunk): ChunkInsert {
  return {
    id: chunk.id,
    bookId: chunk.bookId,
    chapterId: chunk.chapterId,
    ordinal: chunk.ordinal,
    text: chunk.text,
    tokenCount: chunk.tokenCount,
    startChar: chunk.startChar,
    endChar: chunk.endChar,
    embedding: chunk.embedding === null ? null : [...chunk.embedding],
    createdAt: chunk.createdAt,
  }
}
