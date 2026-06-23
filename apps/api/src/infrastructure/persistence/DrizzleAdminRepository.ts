import type { Database } from '@dialogus/db'
import { invitations, securityEvents, session, user } from '@dialogus/db/schema'
import { and, desc, eq, type SQL, sql } from 'drizzle-orm'
import { InvitationConflictError } from '../../application/admin/errors'
import type {
  AdminRepository,
  CreateInvitationInput,
  CursorPage,
  InvitationRecord,
  InvitationStatus,
  ListInvitationsInput,
  ListMembersInput,
  MemberRecord,
  SecurityEventInput,
} from '../../application/admin/ports'

type InvitationRow = typeof invitations.$inferSelect

/** Postgres unique-violation SQLSTATE (surfaced by postgres-js on `error.code`). */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505'
}

function toInvitation(row: InvitationRow): InvitationRecord {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    invitedBy: row.invitedBy,
    consumedByUserId: row.consumedByUserId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Drizzle/Postgres implementation of the admin onboarding + access-control port
 * (US3). Behavior is exercised end-to-end by the Testcontainers integration
 * suite; the application services that consume it are unit-tested with a fake.
 */
export class DrizzleAdminRepository implements AdminRepository {
  constructor(private readonly db: Database) {}

  async findOpenInvitationByEmail(email: string): Promise<InvitationRecord | null> {
    const rows = await this.db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.email, email),
          eq(invitations.status, 'pending'),
          sql`${invitations.expiresAt} > now()`,
        ),
      )
      .limit(1)
    return rows[0] ? toInvitation(rows[0]) : null
  }

  async findInvitationById(id: string): Promise<InvitationRecord | null> {
    const rows = await this.db.select().from(invitations).where(eq(invitations.id, id)).limit(1)
    return rows[0] ? toInvitation(rows[0]) : null
  }

  async createInvitation(input: CreateInvitationInput): Promise<InvitationRecord> {
    try {
      const [row] = await this.db
        .insert(invitations)
        .values({ email: input.email, invitedBy: input.invitedBy, expiresAt: input.expiresAt })
        .returning()
      if (!row) throw new Error('failed to create invitation')
      return toInvitation(row)
    } catch (error) {
      // Concurrent create racing the partial UNIQUE(email) WHERE status='pending'
      // index → surface the domain conflict instead of a raw 23505 (→ 500).
      if (isUniqueViolation(error)) {
        throw new InvitationConflictError('A live invitation already exists for this email')
      }
      throw error
    }
  }

  async expireStalePendingInvitations(email: string): Promise<void> {
    await this.db
      .update(invitations)
      .set({ status: 'expired' })
      .where(
        and(
          eq(invitations.email, email),
          eq(invitations.status, 'pending'),
          sql`${invitations.expiresAt} <= now()`,
        ),
      )
  }

  async listInvitations(input: ListInvitationsInput): Promise<CursorPage<InvitationRecord>> {
    const conditions: SQL[] = []
    if (input.status) conditions.push(eq(invitations.status, input.status))
    if (input.cursor) {
      conditions.push(
        sql`(${invitations.createdAt}, ${invitations.id}) < (${input.cursor.createdAt.toISOString()}, ${input.cursor.id})`,
      )
    }
    const rows = await this.db
      .select()
      .from(invitations)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(invitations.createdAt), desc(invitations.id))
      .limit(input.limit + 1)

    const hasNext = rows.length > input.limit
    const items = (hasNext ? rows.slice(0, input.limit) : rows).map(toInvitation)
    const last = hasNext ? items[items.length - 1] : undefined
    return {
      items,
      nextCursor: last ? { createdAt: last.createdAt, id: last.id } : null,
    }
  }

  async setInvitationStatus(
    id: string,
    status: InvitationStatus,
    consumedByUserId?: string | null,
  ): Promise<InvitationRecord> {
    const patch: { status: InvitationStatus; consumedByUserId?: string | null } = { status }
    if (consumedByUserId !== undefined) patch.consumedByUserId = consumedByUserId
    const [row] = await this.db
      .update(invitations)
      .set(patch)
      .where(eq(invitations.id, id))
      .returning()
    if (!row) throw new Error(`invitation ${id} not found`)
    return toInvitation(row)
  }

  async consumeInvitationByEmail(email: string, userId: string): Promise<void> {
    // Only an OPEN invite (pending AND unexpired) is consumable, matching the
    // gate that admitted the account — never flip an expired row to `used`.
    await this.db
      .update(invitations)
      .set({ status: 'used', consumedByUserId: userId })
      .where(
        and(
          eq(invitations.email, email),
          eq(invitations.status, 'pending'),
          sql`${invitations.expiresAt} > now()`,
        ),
      )
  }

  async userExistsByEmail(email: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1)
    return rows.length > 0
  }

  async listMembers(input: ListMembersInput): Promise<CursorPage<MemberRecord>> {
    const conditions: SQL[] = []
    if (input.cursor) {
      conditions.push(
        sql`(${user.createdAt}, ${user.id}) < (${input.cursor.createdAt.toISOString()}, ${input.cursor.id})`,
      )
    }
    const rows = await this.db
      .select({
        id: user.id,
        email: user.email,
        role: user.role,
        banned: user.banned,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(input.limit + 1)

    const hasNext = rows.length > input.limit
    const items = hasNext ? rows.slice(0, input.limit) : rows
    const last = hasNext ? items[items.length - 1] : undefined
    return {
      items,
      nextCursor: last ? { createdAt: last.createdAt, id: last.id } : null,
    }
  }

  async findMemberById(id: string): Promise<MemberRecord | null> {
    const rows = await this.db
      .select({
        id: user.id,
        email: user.email,
        role: user.role,
        banned: user.banned,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  async countActiveAdmins(): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(user)
      .where(and(eq(user.role, 'admin'), eq(user.banned, false)))
    return rows[0]?.count ?? 0
  }

  async setMemberBanned(id: string, banned: boolean): Promise<MemberRecord> {
    const [row] = await this.db
      .update(user)
      .set(banned ? { banned: true } : { banned: false, banReason: null, banExpires: null })
      .where(eq(user.id, id))
      .returning({
        id: user.id,
        email: user.email,
        role: user.role,
        banned: user.banned,
        createdAt: user.createdAt,
      })
    if (!row) throw new Error(`user ${id} not found`)
    return row
  }

  async setMemberRole(id: string, role: string): Promise<MemberRecord> {
    const [row] = await this.db.update(user).set({ role }).where(eq(user.id, id)).returning({
      id: user.id,
      email: user.email,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
    })
    if (!row) throw new Error(`user ${id} not found`)
    return row
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db.delete(session).where(eq(session.userId, userId))
  }

  async recordSecurityEvent(event: SecurityEventInput): Promise<void> {
    await this.db.insert(securityEvents).values({
      eventType: event.eventType,
      userId: event.userId ?? null,
      email: event.email ?? null,
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
      metadata: event.metadata ?? null,
    })
  }
}
