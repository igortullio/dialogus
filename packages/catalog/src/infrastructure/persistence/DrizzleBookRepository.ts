import type { Database } from '@dialogus/db/client'
import { books } from '@dialogus/db/schema'
import { and, desc, eq, isNull, type SQL, sql } from 'drizzle-orm'
import type { Book } from '../../domain/book/Book'
import { BookNotFoundError } from '../../domain/book/BookError'
import type {
  BookRepository,
  Cursor,
  ListFilter,
  ListResult,
} from '../../domain/book/BookRepository.port'
import { type BookRow, toDomain, toPersistence } from './mappers/BookMapper'

const DEFAULT_LIST_LIMIT = 20

export class DrizzleBookRepository implements BookRepository {
  constructor(private readonly db: Database) {}

  async save(book: Book): Promise<Book> {
    const row = toPersistence(book)
    const { id: _id, createdAt: _createdAt, ...updateFields } = row
    const [saved] = await this.db
      .insert(books)
      .values(row)
      .onConflictDoUpdate({ target: books.id, set: updateFields })
      .returning()
    if (!saved) {
      throw new Error(`save returned no row for book ${book.id}`)
    }
    return toDomain(saved)
  }

  async findById(id: string): Promise<Book | null> {
    const row = await this.db.query.books.findFirst({
      where: eq(books.id, id),
    })
    return row ? toDomain(row) : null
  }

  async findByGutendexId(gutendexId: number): Promise<Book | null> {
    const row = await this.db.query.books.findFirst({
      where: eq(books.gutendexId, gutendexId),
    })
    return row ? toDomain(row) : null
  }

  async list(filter: ListFilter, cursor?: Cursor, limit?: number): Promise<ListResult> {
    const limitVal = limit ?? DEFAULT_LIST_LIMIT
    const conditions: SQL[] = []
    if (filter.includeDeleted !== true) {
      conditions.push(isNull(books.deletedAt))
    }
    if (filter.status) {
      conditions.push(eq(books.ingestionStatus, filter.status))
    }
    if (filter.language) {
      conditions.push(sql`${filter.language} = ANY(${books.languages})`)
    }
    if (cursor) {
      conditions.push(
        sql`(${books.createdAt}, ${books.id}) < (${cursor.createdAt.toISOString()}, ${cursor.id})`,
      )
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined
    const [rows, countRows] = await Promise.all([
      this.db
        .select()
        .from(books)
        .where(whereClause)
        .orderBy(desc(books.createdAt), desc(books.id))
        .limit(limitVal + 1) as Promise<BookRow[]>,
      this.db.select({ count: sql<number>`count(*)::int` }).from(books).where(whereClause),
    ])

    const hasNext = rows.length > limitVal
    const trimmed = hasNext ? rows.slice(0, limitVal) : rows
    const last = hasNext ? trimmed[trimmed.length - 1] : undefined
    const total = countRows[0]?.count ?? 0
    return {
      books: trimmed.map(toDomain),
      nextCursor: last ? { createdAt: last.createdAt, id: last.id } : null,
      total,
    }
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .update(books)
      .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(books.id, id))
  }

  async restore(id: string): Promise<Book> {
    const [restored] = await this.db
      .update(books)
      .set({ deletedAt: null, updatedAt: sql`now()` })
      .where(eq(books.id, id))
      .returning()
    if (!restored) {
      throw new BookNotFoundError(`Book ${id} not found`)
    }
    return toDomain(restored)
  }
}
