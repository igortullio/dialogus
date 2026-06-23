import { describe, expect, it } from 'vitest'
import {
  listMembers,
  type MembersDeps,
  restoreMember,
  revokeMember,
  setMemberRole,
} from '../../../src/application/admin/members'
import { fakeAdminRepo, makeMember } from '../../_helpers/fakeAdminRepo'

const ADMIN_A = makeMember({ id: 'admin-a', email: 'a@test.local', role: 'admin' })
const ADMIN_B = makeMember({ id: 'admin-b', email: 'b@test.local', role: 'admin' })
const MEMBER = makeMember({ id: 'member-1', email: 'm@test.local', role: 'member' })

describe('revokeMember', () => {
  it('refuses to revoke the only active admin (last-admin safeguard, FR-017)', async () => {
    const repo = fakeAdminRepo({ members: [ADMIN_A, MEMBER] })
    const deps: MembersDeps = { repo }

    await expect(revokeMember(deps, ADMIN_A.id)).rejects.toMatchObject({ code: 'LAST_ADMIN' })

    expect(repo.state.members.find((m) => m.id === ADMIN_A.id)?.banned).toBe(false)
    expect(repo.state.deletedSessionsFor).not.toContain(ADMIN_A.id)
    expect(repo.state.events).toHaveLength(0)
  })

  it('bans a member, invalidates their sessions, and audits access_revoked', async () => {
    const repo = fakeAdminRepo({ members: [ADMIN_A, MEMBER] })

    const result = await revokeMember({ repo }, MEMBER.id, { actorId: ADMIN_A.id })

    expect(result.banned).toBe(true)
    expect(repo.state.deletedSessionsFor).toContain(MEMBER.id)
    expect(repo.state.events).toEqual([
      expect.objectContaining({ eventType: 'access_revoked', userId: MEMBER.id }),
    ])
  })

  it('revokes an admin when another active admin remains', async () => {
    const repo = fakeAdminRepo({ members: [ADMIN_A, ADMIN_B] })

    const result = await revokeMember({ repo }, ADMIN_A.id)

    expect(result.banned).toBe(true)
    expect(repo.state.deletedSessionsFor).toContain(ADMIN_A.id)
  })

  it('throws member-not-found for an unknown id', async () => {
    const repo = fakeAdminRepo({ members: [ADMIN_A] })

    await expect(revokeMember({ repo }, 'nope')).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' })
  })
})

describe('setMemberRole', () => {
  it('refuses to demote the only active admin', async () => {
    const repo = fakeAdminRepo({ members: [ADMIN_A, MEMBER] })

    await expect(setMemberRole({ repo }, ADMIN_A.id, 'member')).rejects.toMatchObject({
      code: 'LAST_ADMIN',
    })

    expect(repo.state.members.find((m) => m.id === ADMIN_A.id)?.role).toBe('admin')
  })

  it('demotes an admin when another active admin remains', async () => {
    const repo = fakeAdminRepo({ members: [ADMIN_A, ADMIN_B] })

    const result = await setMemberRole({ repo }, ADMIN_A.id, 'member')

    expect(result.role).toBe('member')
  })

  it('promotes a member to admin', async () => {
    const repo = fakeAdminRepo({ members: [ADMIN_A, MEMBER] })

    const result = await setMemberRole({ repo }, MEMBER.id, 'admin')

    expect(result.role).toBe('admin')
  })
})

describe('restoreMember', () => {
  it('unbans a previously revoked member', async () => {
    const banned = makeMember({ id: 'banned-1', role: 'member', banned: true })
    const repo = fakeAdminRepo({ members: [ADMIN_A, banned] })

    const result = await restoreMember({ repo }, banned.id)

    expect(result.banned).toBe(false)
  })
})

describe('listMembers', () => {
  it('returns members ordered newest-first within the page limit', async () => {
    const repo = fakeAdminRepo({ members: [ADMIN_A, ADMIN_B, MEMBER] })

    const page = await listMembers({ repo }, { limit: 50 })

    expect(page.items).toHaveLength(3)
    expect(page.nextCursor).toBeNull()
  })
})
