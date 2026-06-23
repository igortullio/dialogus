import { LastAdminError, MemberNotFoundError } from './errors'
import type {
  AdminRepository,
  CursorPage,
  ListMembersInput,
  MemberRecord,
  UserThreadDeleter,
} from './ports'

export interface MembersDeps {
  readonly repo: AdminRepository
}

export interface RevokeOptions {
  /** The admin performing the revocation, recorded in the audit metadata. */
  readonly actorId?: string
}

export async function listMembers(
  deps: MembersDeps,
  input: ListMembersInput,
): Promise<CursorPage<MemberRecord>> {
  return deps.repo.listMembers(input)
}

async function requireMember(deps: MembersDeps, userId: string): Promise<MemberRecord> {
  const member = await deps.repo.findMemberById(userId)
  if (!member) throw new MemberNotFoundError()
  return member
}

/**
 * Last-admin safeguard (FR-017): refuse an operation that would leave the system
 * with no active administrator. Only relevant when the target is currently a
 * non-banned admin (banning/demoting a member or an already-banned admin is safe).
 */
async function assertNotLastAdmin(deps: MembersDeps, target: MemberRecord): Promise<void> {
  if (target.role !== 'admin' || target.banned) return
  const activeAdmins = await deps.repo.countActiveAdmins()
  if (activeAdmins <= 1) throw new LastAdminError()
}

/**
 * Revoke a member's access (FR-015): ban them, invalidate every active session
 * (SC-007), and append an `access_revoked` audit event. Refuses to revoke the
 * only remaining administrator.
 */
export async function revokeMember(
  deps: MembersDeps,
  userId: string,
  options: RevokeOptions = {},
): Promise<MemberRecord> {
  const target = await requireMember(deps, userId)
  await assertNotLastAdmin(deps, target)

  const updated = await deps.repo.setMemberBanned(userId, true)
  await deps.repo.deleteUserSessions(userId)
  await deps.repo.recordSecurityEvent({
    eventType: 'access_revoked',
    userId,
    email: target.email,
    metadata: options.actorId ? { revokedBy: options.actorId } : null,
  })
  return updated
}

/** Restore a previously revoked member (unban); existing sessions stay gone. */
export async function restoreMember(deps: MembersDeps, userId: string): Promise<MemberRecord> {
  await requireMember(deps, userId)
  return deps.repo.setMemberBanned(userId, false)
}

/** Change a member's role; demoting the only admin is refused (FR-017). */
export async function setMemberRole(
  deps: MembersDeps,
  userId: string,
  role: 'admin' | 'member',
): Promise<MemberRecord> {
  const target = await requireMember(deps, userId)
  if (role === 'member') await assertNotLastAdmin(deps, target)
  return deps.repo.setMemberRole(userId, role)
}

export interface DeleteAccountDeps {
  readonly repo: AdminRepository
  readonly threads: UserThreadDeleter
}

/**
 * Permanently delete an account (FR-023). Refuses to delete the only admin
 * (FR-017). Framework-owned Mastra threads are removed first (no DB cascade,
 * deviation E2), then the user row — whose FKs cascade the app-owned per-user
 * data (`session`/`account`/`library_entries`/`user_book_preferences`) and SET
 * NULL the audit (`security_events`) + `invitations` references. The shared
 * corpus and other users are never touched.
 */
export async function deleteAccount(deps: DeleteAccountDeps, userId: string): Promise<void> {
  const target = await requireMember({ repo: deps.repo }, userId)
  await assertNotLastAdmin({ repo: deps.repo }, target)

  await deps.threads.deleteThreadsForUser(userId)
  await deps.repo.deleteUser(userId)
}
