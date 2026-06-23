import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { books } from './books'

// Account-scoped per-book spoiler boundary (feature 001-multi-user-auth, US2).
// Replaces the per-device localStorage cap so it follows the user across
// devices (FR-008, FR-009, SC-008). `spoiler_cap_chapter` is the max visible
// chapter ordinal; NULL = no cap (unbounded). One row per (user, book).
export const userBookPreferences = pgTable(
  'user_book_preferences',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    spoilerCapChapter: integer('spoiler_cap_chapter'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('user_book_preferences_user_book_unique').on(table.userId, table.bookId),
    index('user_book_preferences_user_id_idx').on(table.userId),
  ],
)
