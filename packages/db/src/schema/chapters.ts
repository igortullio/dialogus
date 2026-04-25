import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { books } from './books'

export const chapters = pgTable(
  'chapters',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    title: text('title').notNull(),
    plainText: text('plain_text').notNull(),
    tokenCount: integer('token_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('chapters_book_id_ordinal_unique').on(table.bookId, table.ordinal),
    index('chapters_book_id_ordinal_idx').on(table.bookId, table.ordinal),
  ],
)
