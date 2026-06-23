import { BookNotFoundError, type LibraryEntryRepository } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { userBookPreferences } from '@dialogus/db/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'

export interface SpoilerCapsDeps {
  readonly db: Database
  readonly libraryRepo: LibraryEntryRepository
}

/** book_id → chapter ordinal cap, or `null` for no cap. */
export type SpoilerCapsMap = Record<string, number | null>

/**
 * Read the user's spoiler caps for the given books. Every requested book id is
 * present in the result; books with no stored preference resolve to `null` (no
 * cap). Membership is not required here — an absent cap leaks nothing (it is the
 * same as "no cap set").
 */
export async function getSpoilerCaps(
  deps: SpoilerCapsDeps,
  userId: string,
  bookIds: readonly string[],
): Promise<SpoilerCapsMap> {
  const caps: SpoilerCapsMap = {}
  for (const id of bookIds) caps[id] = null
  if (bookIds.length === 0) return caps

  const rows = await deps.db
    .select({
      bookId: userBookPreferences.bookId,
      cap: userBookPreferences.spoilerCapChapter,
    })
    .from(userBookPreferences)
    .where(
      and(
        eq(userBookPreferences.userId, userId),
        inArray(userBookPreferences.bookId, [...bookIds]),
      ),
    )
  for (const row of rows) caps[row.bookId] = row.cap
  return caps
}

/**
 * Upsert the user's cap for one book. The book must be in the user's active
 * library — a non-member (or unknown) book resolves to `BookNotFoundError`
 * (don't leak the shared corpus' existence; SC-002). `null` clears the cap.
 */
export async function setSpoilerCap(
  deps: SpoilerCapsDeps,
  userId: string,
  bookId: string,
  cap: number | null,
): Promise<{ bookId: string; spoilerCapChapter: number | null }> {
  const isMember = await deps.libraryRepo.isActiveMember(userId, bookId)
  if (!isMember) {
    throw new BookNotFoundError(`Book ${bookId} not found`)
  }

  await deps.db
    .insert(userBookPreferences)
    .values({ userId, bookId, spoilerCapChapter: cap })
    .onConflictDoUpdate({
      target: [userBookPreferences.userId, userBookPreferences.bookId],
      set: { spoilerCapChapter: cap, updatedAt: sql`now()` },
    })

  return { bookId, spoilerCapChapter: cap }
}
