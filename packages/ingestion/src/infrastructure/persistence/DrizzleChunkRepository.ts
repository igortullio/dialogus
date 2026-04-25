import type { Database } from '@dialogus/db/client'
import { chunks } from '@dialogus/db/schema'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Chunk } from '../../domain/chunk/Chunk'
import type { ChunkEmbeddingUpdate, ChunkRepository } from '../../domain/chunk/ChunkRepository.port'
import { type ChunkRow, toDomain, toPersistence } from './mappers/ChunkMapper'

const STREAM_BATCH_SIZE = 100

export class DrizzleChunkRepository implements ChunkRepository {
  constructor(private readonly db: Database) {}

  async saveMany(input: readonly Chunk[]): Promise<void> {
    if (input.length === 0) return
    const rows = input.map(toPersistence)
    await this.db
      .insert(chunks)
      .values(rows)
      .onConflictDoNothing({
        target: [chunks.bookId, chunks.chapterId, chunks.ordinal],
      })
  }

  async listByBookId(bookId: string): Promise<Chunk[]> {
    const rows = (await this.db
      .select()
      .from(chunks)
      .where(eq(chunks.bookId, bookId))
      .orderBy(asc(chunks.chapterId), asc(chunks.ordinal))) as ChunkRow[]
    return rows.map(toDomain)
  }

  listByBookIdWithoutEmbedding(bookId: string): AsyncIterable<Chunk> {
    return this.streamPendingEmbeddings(bookId)
  }

  private async *streamPendingEmbeddings(bookId: string): AsyncIterable<Chunk> {
    let lastId: string | null = null
    while (true) {
      const conditions = [eq(chunks.bookId, bookId), isNull(chunks.embedding)]
      if (lastId !== null) {
        conditions.push(sql`${chunks.id} > ${lastId}`)
      }
      const rows = (await this.db
        .select()
        .from(chunks)
        .where(and(...conditions))
        .orderBy(asc(chunks.id))
        .limit(STREAM_BATCH_SIZE)) as ChunkRow[]
      if (rows.length === 0) return
      for (const row of rows) {
        yield toDomain(row)
      }
      const last = rows[rows.length - 1]
      if (rows.length < STREAM_BATCH_SIZE || !last) return
      lastId = last.id
    }
  }

  async updateEmbeddingsBatch(updates: readonly ChunkEmbeddingUpdate[]): Promise<void> {
    if (updates.length === 0) return
    const values = sql.join(
      updates.map((u) => sql`(${u.id}::uuid, ${JSON.stringify([...u.embedding])}::vector)`),
      sql`, `,
    )
    await this.db.execute(sql`
      UPDATE chunks AS c
      SET embedding = v.embedding
      FROM (VALUES ${values}) AS v(id, embedding)
      WHERE c.id = v.id
    `)
  }

  async countByBookId(bookId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(chunks)
      .where(eq(chunks.bookId, bookId))
    return row?.count ?? 0
  }

  async findById(chunkId: string): Promise<Chunk | null> {
    const row = await this.db.query.chunks.findFirst({
      where: eq(chunks.id, chunkId),
    })
    return row ? toDomain(row) : null
  }
}
