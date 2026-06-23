import { randomUUID } from 'node:crypto'
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
} from '../../src/application/admin/ports'

export interface FakeAdminState {
  invitations: InvitationRecord[]
  members: MemberRecord[]
  deletedSessionsFor: string[]
  deletedUsers: string[]
  events: SecurityEventInput[]
}

const FAKE_NOW = new Date('2026-06-23T12:00:00.000Z')

function pageCursor<T extends { createdAt: Date; id: string }>(
  all: readonly T[],
  items: readonly T[],
  limit: number,
): CursorPage<T>['nextCursor'] {
  const last = items.at(-1)
  return all.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null
}

/**
 * An in-memory `AdminRepository` for unit tests. Holds the same observable
 * state the Drizzle implementation would (invitations, members, audit events,
 * which users had sessions revoked) so service decision logic — the last-admin
 * guard, invitation state machine, conflict checks — is tested against real
 * behavior rather than mocked query chains.
 */
export function fakeAdminRepo(
  seed: { invitations?: InvitationRecord[]; members?: MemberRecord[] } = {},
): AdminRepository & { state: FakeAdminState } {
  const state: FakeAdminState = {
    invitations: [...(seed.invitations ?? [])],
    members: [...(seed.members ?? [])],
    deletedSessionsFor: [],
    deletedUsers: [],
    events: [],
  }

  function isOpen(inv: InvitationRecord): boolean {
    return inv.status === 'pending' && inv.expiresAt.getTime() > FAKE_NOW.getTime()
  }

  return {
    state,

    async findOpenInvitationByEmail(email) {
      return state.invitations.find((i) => i.email === email && isOpen(i)) ?? null
    },

    async findInvitationById(id) {
      return state.invitations.find((i) => i.id === id) ?? null
    },

    async createInvitation(input: CreateInvitationInput) {
      const record: InvitationRecord = {
        id: randomUUID(),
        email: input.email,
        status: 'pending',
        invitedBy: input.invitedBy,
        consumedByUserId: null,
        expiresAt: input.expiresAt,
        createdAt: FAKE_NOW,
        updatedAt: FAKE_NOW,
      }
      state.invitations.push(record)
      return record
    },

    async expireStalePendingInvitations(email) {
      state.invitations = state.invitations.map((i) =>
        i.email === email && i.status === 'pending' && i.expiresAt.getTime() <= FAKE_NOW.getTime()
          ? { ...i, status: 'expired', updatedAt: FAKE_NOW }
          : i,
      )
    },

    async listInvitations(input: ListInvitationsInput): Promise<CursorPage<InvitationRecord>> {
      const filtered = state.invitations
        .filter((i) => (input.status ? i.status === input.status : true))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      const items = filtered.slice(0, input.limit)
      return { items, nextCursor: pageCursor(filtered, items, input.limit) }
    },

    async setInvitationStatus(id, status: InvitationStatus, consumedByUserId) {
      const current = state.invitations.find((i) => i.id === id)
      if (!current) throw new Error(`invitation ${id} not found`)
      const updated: InvitationRecord = {
        ...current,
        status,
        consumedByUserId: consumedByUserId ?? current.consumedByUserId,
        updatedAt: FAKE_NOW,
      }
      state.invitations = state.invitations.map((i) => (i.id === id ? updated : i))
      return updated
    },

    async consumeInvitationByEmail(email, userId) {
      const current = state.invitations.find((i) => i.email === email && isOpen(i))
      if (!current) return
      const updated: InvitationRecord = {
        ...current,
        status: 'used',
        consumedByUserId: userId,
        updatedAt: FAKE_NOW,
      }
      state.invitations = state.invitations.map((i) => (i.id === current.id ? updated : i))
    },

    async userExistsByEmail(email) {
      return state.members.some((m) => m.email === email)
    },

    async listMembers(input: ListMembersInput): Promise<CursorPage<MemberRecord>> {
      const sorted = [...state.members].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      )
      const items = sorted.slice(0, input.limit)
      return { items, nextCursor: pageCursor(sorted, items, input.limit) }
    },

    async findMemberById(id) {
      return state.members.find((m) => m.id === id) ?? null
    },

    async countActiveAdmins() {
      return state.members.filter((m) => m.role === 'admin' && !m.banned).length
    },

    async setMemberBanned(id, banned) {
      const current = state.members.find((m) => m.id === id)
      if (!current) throw new Error(`member ${id} not found`)
      const updated: MemberRecord = { ...current, banned }
      state.members = state.members.map((m) => (m.id === id ? updated : m))
      return updated
    },

    async setMemberRole(id, role) {
      const current = state.members.find((m) => m.id === id)
      if (!current) throw new Error(`member ${id} not found`)
      const updated: MemberRecord = { ...current, role }
      state.members = state.members.map((m) => (m.id === id ? updated : m))
      return updated
    },

    async deleteUserSessions(userId) {
      state.deletedSessionsFor.push(userId)
    },

    async deleteUser(userId) {
      state.deletedUsers.push(userId)
      state.members = state.members.filter((m) => m.id !== userId)
    },

    async recordSecurityEvent(event) {
      state.events.push(event)
    },
  }
}

export function makeMember(overrides: Partial<MemberRecord> = {}): MemberRecord {
  return {
    id: overrides.id ?? `user-${randomUUID()}`,
    email: overrides.email ?? 'member@test.local',
    role: overrides.role ?? 'member',
    banned: overrides.banned ?? false,
    createdAt: overrides.createdAt ?? new Date('2026-06-01T00:00:00.000Z'),
  }
}

export function makeInvitation(overrides: Partial<InvitationRecord> = {}): InvitationRecord {
  return {
    id: overrides.id ?? randomUUID(),
    email: overrides.email ?? 'invitee@test.local',
    status: overrides.status ?? 'pending',
    invitedBy: overrides.invitedBy ?? 'admin-1',
    consumedByUserId: overrides.consumedByUserId ?? null,
    expiresAt: overrides.expiresAt ?? new Date('2026-07-01T00:00:00.000Z'),
    createdAt: overrides.createdAt ?? new Date('2026-06-20T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-06-20T00:00:00.000Z'),
  }
}
