import type { CursorPosition } from '@dialogus/shared/http/cursor'

/** Lifecycle of an allowlist invitation (FR-014, FR-016). */
export type InvitationStatus = 'pending' | 'used' | 'expired' | 'revoked'

/** A row of the app-owned `invitations` allowlist table. */
export interface InvitationRecord {
  readonly id: string
  readonly email: string
  readonly status: InvitationStatus
  readonly invitedBy: string | null
  readonly consumedByUserId: string | null
  readonly expiresAt: Date
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** A member (Better Auth `user`) as exposed by the admin surface. */
export interface MemberRecord {
  readonly id: string
  readonly email: string
  readonly role: string
  readonly banned: boolean
  readonly createdAt: Date
}

/** The audit event types persisted to `security_events` (FR-005). */
export type SecurityEventType =
  | 'account_created'
  | 'sign_in'
  | 'sign_in_failed'
  | 'access_revoked'
  | 'unauthorized_signup_attempt'
  | 'rate_limited'

/** An append-only audit record. `userId`/`email` are nullable for anonymous attempts. */
export interface SecurityEventInput {
  readonly eventType: SecurityEventType
  readonly userId?: string | null
  readonly email?: string | null
  readonly ipAddress?: string | null
  readonly userAgent?: string | null
  readonly metadata?: Record<string, unknown> | null
}

export interface CreateInvitationInput {
  readonly email: string
  readonly invitedBy: string | null
  readonly expiresAt: Date
}

export interface CursorPage<T> {
  readonly items: readonly T[]
  readonly nextCursor: CursorPosition | null
}

export interface ListInvitationsInput {
  readonly status?: InvitationStatus
  readonly cursor?: CursorPosition
  readonly limit: number
}

export interface ListMembersInput {
  readonly cursor?: CursorPosition
  readonly limit: number
}

/**
 * Persistence port for the owner/admin onboarding + access-control surface
 * (US3). Mirrors `LibraryEntryRepository`: application services and the Better
 * Auth allowlist hook depend on this interface, so their decision logic
 * (state machine, last-admin guard, conflict checks) is unit-tested with an
 * in-memory fake; the Drizzle implementation is covered by the Testcontainers
 * integration suite.
 */
export interface AdminRepository {
  /** A `pending`, not-yet-expired invitation for the normalized email, else null. */
  findOpenInvitationByEmail(email: string): Promise<InvitationRecord | null>
  findInvitationById(id: string): Promise<InvitationRecord | null>
  createInvitation(input: CreateInvitationInput): Promise<InvitationRecord>
  /**
   * Lazily transition this email's pending-but-past-`expires_at` rows to
   * `expired`, so a fresh invitation can be issued without colliding with the
   * partial `UNIQUE(email) WHERE status='pending'` index (FR-016 state machine).
   */
  expireStalePendingInvitations(email: string): Promise<void>
  listInvitations(input: ListInvitationsInput): Promise<CursorPage<InvitationRecord>>
  /** Transition an invitation to a terminal/`used` status; returns the updated row. */
  setInvitationStatus(
    id: string,
    status: InvitationStatus,
    consumedByUserId?: string | null,
  ): Promise<InvitationRecord>
  /** Consume the open invitation for an email after account creation (idempotent no-op if none). */
  consumeInvitationByEmail(email: string, userId: string): Promise<void>

  userExistsByEmail(email: string): Promise<boolean>
  listMembers(input: ListMembersInput): Promise<CursorPage<MemberRecord>>
  findMemberById(id: string): Promise<MemberRecord | null>
  /** Count of non-banned `admin` users — drives the last-admin safeguard (FR-017). */
  countActiveAdmins(): Promise<number>
  setMemberBanned(id: string, banned: boolean): Promise<MemberRecord>
  setMemberRole(id: string, role: string): Promise<MemberRecord>
  /** Revocation invalidates every active session for the user (FR-015, SC-007). */
  deleteUserSessions(userId: string): Promise<void>
  /**
   * Delete the user row (FR-023). DB FKs cascade `session`/`account`/
   * `library_entries`/`user_book_preferences` and SET NULL the audit
   * (`security_events`) + `invitations` back-references; the shared corpus is
   * untouched.
   */
  deleteUser(userId: string): Promise<void>

  recordSecurityEvent(event: SecurityEventInput): Promise<void>
}

/**
 * Deletes a user's Mastra conversation threads by `resourceId`. Mastra tables
 * are framework-owned and not FK-linked (deviation E2), so account deletion
 * removes them through Mastra's API rather than a DB cascade.
 */
export interface UserThreadDeleter {
  deleteThreadsForUser(userId: string): Promise<void>
}
