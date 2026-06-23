import type { Database } from '@dialogus/db/client'
import { books, libraryEntries } from '@dialogus/db/schema'
import { and, desc, eq, isNull, type SQL, sql } from 'drizzle-orm'
import type { Cursor, ListFilter, ListResult } from '../../domain/book/BookRepository.port'
import type { LibraryEntryRepository } from '../../domain/libraryEntry/LibraryEntryRepository.port'
import { toDomain } from './mappers/BookMapper'

const DEFAULT_LIST_LIMIT = 20

export class DrizzleLibraryEntryRepository implements LibraryEntryRepository {
  constructor(private readonly db: Database) {}

  async upsertMembership(userId: string, bookId: string): Promise<void> {
    await this.db
      .insert(libraryEntries)
      .values({ userId, bookId })
      .onConflictDoUpdate({
        target: [libraryEntries.userId, libraryEntries.bookId],
        set: { deletedAt: null, addedAt: sql`now()` },
      })
  }

  async isActiveMember(userId: string, bookId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: libraryEntries.id })
      .from(libraryEntries)
      .where(
        and(
          eq(libraryEntries.userId, userId),
          eq(libraryEntries.bookId, bookId),
          isNull(libraryEntries.deletedAt),
        ),
      )
      .limit(1)
    return rows.length > 0
  }

  async softRemove(userId: string, bookId: string): Promise<boolean> {
    const res = await this.db
      .update(libraryEntries)
      .set({ deletedAt: sql`now()` })
      .where(
        and(
          eq(libraryEntries.userId, userId),
          eq(libraryEntries.bookId, bookId),
          isNull(libraryEntries.deletedAt),
        ),
      )
      .returning({ id: libraryEntries.id })
    return res.length > 0
  }

  async restore(userId: string, bookId: string): Promise<boolean> {
    const res = await this.db
      .update(libraryEntries)
      .set({ deletedAt: null })
      .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.bookId, bookId)))
      .returning({ id: libraryEntries.id })
    return res.length > 0
  }

  async listForUser(
    userId: string,
    filter: ListFilter,
    cursor?: Cursor,
    limit?: number,
  ): Promise<ListResult> {
    const limitVal = limit ?? DEFAULT_LIST_LIMIT
    const conditions: SQL[] = [eq(libraryEntries.userId, userId)]
    if (filter.includeDeleted !== true) conditions.push(isNull(libraryEntries.deletedAt))
    if (filter.status) conditions.push(eq(books.ingestionStatus, filter.status))
    if (filter.language) conditions.push(sql`${filter.language} = ANY(${books.languages})`)
    if (cursor) {
      conditions.push(
        sql`(${libraryEntries.addedAt}, ${libraryEntries.id}) < (${cursor.createdAt.toISOString()}, ${cursor.id})`,
      )
    }
    const whereClause = and(...conditions)

    const [rows, countRows] = await Promise.all([
      this.db
        .select({ book: books, entryId: libraryEntries.id, addedAt: libraryEntries.addedAt })
        .from(libraryEntries)
        .innerJoin(books, eq(books.id, libraryEntries.bookId))
        .where(whereClause)
        .orderBy(desc(libraryEntries.addedAt), desc(libraryEntries.id))
        .limit(limitVal + 1),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(libraryEntries)
        .innerJoin(books, eq(books.id, libraryEntries.bookId))
        .where(whereClause),
    ])

    const hasNext = rows.length > limitVal
    const trimmed = hasNext ? rows.slice(0, limitVal) : rows
    const last = hasNext ? trimmed[trimmed.length - 1] : undefined
    const total = countRows[0]?.count ?? 0
    return {
      books: trimmed.map((r) => toDomain(r.book)),
      nextCursor: last ? { createdAt: last.addedAt, id: last.entryId } : null,
      total,
    }
  }

  async countInFlight(userId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(libraryEntries)
      .innerJoin(books, eq(books.id, libraryEntries.bookId))
      .where(
        and(
          eq(libraryEntries.userId, userId),
          isNull(libraryEntries.deletedAt),
          sql`${books.ingestionStatus} NOT IN ('ready', 'failed')`,
        ),
      )
    return rows[0]?.count ?? 0
  }
}
