import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { books } from './books'

// Per-user membership over the shared `books` corpus (feature 001-multi-user-auth,
// US2). The only new per-user concept: which titles a user added to their own
// library, with per-user ordering (added_at) and per-user soft-remove
// (deleted_at). `books`/`chapters`/`chunks` stay global — a member remove never
// deletes shared content. `user_id` is text (Better Auth user PK); `book_id` uuid.
export const libraryEntries = pgTable(
  'library_entries',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    unique('library_entries_user_book_unique').on(table.userId, table.bookId),
    // Cursor pagination over a user's active library, ordered by add time.
    index('library_entries_user_active_idx')
      .on(table.userId, table.addedAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    // "Is any member still referencing this book?" lookups (FR-013).
    index('library_entries_book_id_idx').on(table.bookId),
  ],
)
