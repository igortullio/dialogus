import type { Chunk } from './Chunk'

export interface ChunkEmbeddingUpdate {
  readonly id: string
  readonly embedding: readonly number[]
}

export interface ChunkRepository {
  saveMany(chunks: readonly Chunk[]): Promise<void>
  listByBookId(bookId: string): Promise<Chunk[]>
  listByBookIdWithoutEmbedding(bookId: string): AsyncIterable<Chunk>
  updateEmbeddingsBatch(updates: readonly ChunkEmbeddingUpdate[]): Promise<void>
  countByBookId(bookId: string): Promise<number>
  findById(chunkId: string): Promise<Chunk | null>
}
