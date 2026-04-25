import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp, unique, uuid, vector } from 'drizzle-orm/pg-core'
import { books } from './books'
import { chapters } from './chapters'

export const CHUNK_EMBEDDING_DIMENSIONS = 1536

export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    text: text('text').notNull(),
    tokenCount: integer('token_count').notNull(),
    startChar: integer('start_char').notNull(),
    endChar: integer('end_char').notNull(),
    embedding: vector('embedding', { dimensions: CHUNK_EMBEDDING_DIMENSIONS }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('chunks_book_id_chapter_id_ordinal_unique').on(
      table.bookId,
      table.chapterId,
      table.ordinal,
    ),
    index('chunks_book_id_pending_embedding_idx')
      .on(table.bookId)
      .where(sql`${table.embedding} IS NULL`),
    index('chunks_chapter_id_idx').on(table.chapterId),
  ],
)
