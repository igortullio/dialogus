import { describe, expect, it, vi } from 'vitest'
import { type DeleteAccountDeps, deleteAccount } from '../../../src/application/admin/members'
import type { UserThreadDeleter } from '../../../src/application/admin/ports'
import { fakeAdminRepo, makeMember } from '../../_helpers/fakeAdminRepo'

const ADMIN_A = makeMember({ id: 'admin-a', role: 'admin' })
const ADMIN_B = makeMember({ id: 'admin-b', role: 'admin' })
const MEMBER = makeMember({ id: 'member-1', role: 'member' })

function fakeThreads(): UserThreadDeleter & { deleted: string[] } {
  const deleted: string[] = []
  return {
    deleted,
    deleteThreadsForUser: vi.fn(async (id: string) => {
      deleted.push(id)
    }),
  }
}

describe('deleteAccount (FR-023)', () => {
  it('deletes a member: removes their Mastra threads, then the user (cascade)', async () => {
    const repo = fakeAdminRepo({ members: [ADMIN_A, MEMBER] })
    const threads = fakeThreads()
    const deps: DeleteAccountDeps = { repo, threads }

    await deleteAccount(deps, MEMBER.id)

    expect(threads.deleted).toEqual([MEMBER.id])
    expect(repo.state.deletedUsers).toContain(MEMBER.id)
    expect(repo.state.members.find((m) => m.id === MEMBER.id)).toBeUndefined()
  })

  it('removes Mastra threads before deleting the user (no orphaned cleanup on a half-failure)', async () => {
    const repo = fakeAdminRepo({ members: [ADMIN_A, MEMBER] })
    const order: string[] = []
    const threads: UserThreadDeleter = {
      deleteThreadsForUser: vi.fn(async () => {
        order.push('threads')
      }),
    }
    const spyRepo = {
      ...repo,
      deleteUser: vi.fn(async (id: string) => {
        order.push('user')
        await repo.deleteUser(id)
      }),
    }

    await deleteAccount({ repo: spyRepo, threads }, MEMBER.id)

    expect(order).toEqual(['threads', 'user'])
  })

  it('refuses to delete the only active admin (last-admin safeguard, FR-017)', async () => {
    const repo = fakeAdminRepo({ members: [ADMIN_A, MEMBER] })
    const threads = fakeThreads()

    await expect(deleteAccount({ repo, threads }, ADMIN_A.id)).rejects.toMatchObject({
      code: 'LAST_ADMIN',
    })

    expect(threads.deleted).toHaveLength(0)
    expect(repo.state.deletedUsers).toHaveLength(0)
  })

  it('deletes an admin when another active admin remains', async () => {
    const repo = fakeAdminRepo({ members: [ADMIN_A, ADMIN_B] })
    const threads = fakeThreads()

    await deleteAccount({ repo, threads }, ADMIN_A.id)

    expect(repo.state.deletedUsers).toContain(ADMIN_A.id)
  })

  it('throws member-not-found for an unknown id', async () => {
    const repo = fakeAdminRepo({ members: [ADMIN_A] })
    const threads = fakeThreads()

    await expect(deleteAccount({ repo, threads }, 'ghost')).rejects.toMatchObject({
      code: 'MEMBER_NOT_FOUND',
    })
    expect(threads.deleted).toHaveLength(0)
  })
})
