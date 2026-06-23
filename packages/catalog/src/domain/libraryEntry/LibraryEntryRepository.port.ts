import type { Cursor, ListFilter, ListResult } from '../book/BookRepository.port'

/**
 * Per-user membership over the shared `books` corpus. Membership is the only
 * per-user concept; the books/chapters/chunks stay global. Removing a member's
 * entry never deletes shared content (FR-013).
 */
export interface LibraryEntryRepository {
  /** Insert the membership, or clear a prior soft-remove (re-add). Idempotent. */
  upsertMembership(userId: string, bookId: string): Promise<void>
  /** Whether the user has an ACTIVE (not removed) membership for the book. */
  isActiveMember(userId: string, bookId: string): Promise<boolean>
  /** Soft-remove the user's active membership; false if none was active. */
  softRemove(userId: string, bookId: string): Promise<boolean>
  /** Restore the user's removed membership; false if no membership row exists. */
  restore(userId: string, bookId: string): Promise<boolean>
  /** The user's library (JOIN to shared books); cursor on (added_at, entry id). */
  listForUser(
    userId: string,
    filter: ListFilter,
    cursor?: Cursor,
    limit?: number,
  ): Promise<ListResult>
  /** Count the user's active memberships whose book ingestion is still in flight (FR-021). */
  countInFlight(userId: string): Promise<number>
}
