import type { Database } from '@dialogus/db/client'
import { chapters } from '@dialogus/db/schema'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Chapter } from '../../domain/chapter/Chapter'
import type { ChapterRepository } from '../../domain/chapter/ChapterRepository.port'
import { type ChapterRow, toDomain, toPersistence } from './mappers/ChapterMapper'

const STREAM_BATCH_SIZE = 25

export class DrizzleChapterRepository implements ChapterRepository {
  constructor(private readonly db: Database) {}

  async saveMany(input: readonly Chapter[]): Promise<void> {
    if (input.length === 0) return
    const rows = input.map(toPersistence)
    await this.db
      .insert(chapters)
      .values(rows)
      .onConflictDoNothing({ target: [chapters.bookId, chapters.ordinal] })
  }

  async listByBookId(bookId: string): Promise<Chapter[]> {
    const rows = (await this.db
      .select()
      .from(chapters)
      .where(eq(chapters.bookId, bookId))
      .orderBy(asc(chapters.ordinal))) as ChapterRow[]
    return rows.map(toDomain)
  }

  streamByBookId(bookId: string): AsyncIterable<Chapter> {
    return this.streamChapters(bookId)
  }

  private async *streamChapters(bookId: string): AsyncIterable<Chapter> {
    let lastOrdinal: number | null = null
    while (true) {
      const conditions = [eq(chapters.bookId, bookId)]
      if (lastOrdinal !== null) {
        conditions.push(sql`${chapters.ordinal} > ${lastOrdinal}`)
      }
      const rows = (await this.db
        .select()
        .from(chapters)
        .where(and(...conditions))
        .orderBy(asc(chapters.ordinal))
        .limit(STREAM_BATCH_SIZE)) as ChapterRow[]
      if (rows.length === 0) return
      for (const row of rows) {
        yield toDomain(row)
      }
      const last = rows[rows.length - 1]
      if (rows.length < STREAM_BATCH_SIZE || !last) return
      lastOrdinal = last.ordinal
    }
  }

  async countByBookId(bookId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(chapters)
      .where(eq(chapters.bookId, bookId))
    return row?.count ?? 0
  }

  async findById(chapterId: string): Promise<Chapter | null> {
    const row = await this.db.query.chapters.findFirst({
      where: eq(chapters.id, chapterId),
    })
    return row ? toDomain(row) : null
  }
}
