import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { books } from './books'
import { chapters } from './chapters'

export const chapterSummaries = pgTable(
  'chapter_summaries',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    chapterId: uuid('chapter_id')
      .notNull()
      .unique()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    summary: text('summary').notNull(),
    tokenCount: integer('token_count').notNull(),
    model: text('model').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('chapter_summaries_book_id_idx').on(table.bookId)],
)
