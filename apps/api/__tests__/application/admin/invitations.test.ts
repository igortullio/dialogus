import { describe, expect, it, vi } from 'vitest'
import {
  type AcceptInvitationDeps,
  acceptInvitation,
  createInvitation,
  type InvitationServiceDeps,
  listInvitations,
  revokeInvitation,
} from '../../../src/application/admin/invitations'
import { fakeAdminRepo, makeInvitation, makeMember } from '../../_helpers/fakeAdminRepo'

const FIXED_NOW = new Date('2026-06-23T12:00:00.000Z')

function emailSpy() {
  return { send: vi.fn(async () => undefined) }
}

function svcDeps(
  repo: ReturnType<typeof fakeAdminRepo>,
  email = emailSpy(),
): InvitationServiceDeps {
  return {
    repo,
    email,
    appUrl: 'https://app.dialogus.test',
    now: () => FIXED_NOW,
    defaultExpiryHours: 168,
  }
}

describe('createInvitation', () => {
  it('creates a pending invitation and emails the accept-invite link', async () => {
    const repo = fakeAdminRepo()
    const email = emailSpy()

    const inv = await createInvitation(svcDeps(repo, email), {
      email: 'New.Person@Example.com',
      invitedBy: 'admin-1',
    })

    expect(inv.status).toBe('pending')
    expect(inv.email).toBe('new.person@example.com') // normalized
    expect(inv.expiresAt.getTime()).toBe(FIXED_NOW.getTime() + 168 * 3600 * 1000)
    expect(email.send).toHaveBeenCalledTimes(1)
    const sent = email.send.mock.calls[0]?.[0] as { to: string; html: string; text?: string }
    expect(sent.to).toBe('new.person@example.com')
    expect(`${sent.html} ${sent.text ?? ''}`).toContain(`/accept-invite?invitation=${inv.id}`)
  })

  it('honors a custom expiresInHours', async () => {
    const repo = fakeAdminRepo()

    const inv = await createInvitation(svcDeps(repo), {
      email: 'x@example.com',
      invitedBy: 'admin-1',
      expiresInHours: 24,
    })

    expect(inv.expiresAt.getTime()).toBe(FIXED_NOW.getTime() + 24 * 3600 * 1000)
  })

  it('rejects when an account already exists for the email (conflict)', async () => {
    const repo = fakeAdminRepo({ members: [makeMember({ email: 'taken@example.com' })] })
    const email = emailSpy()

    await expect(
      createInvitation(svcDeps(repo, email), { email: 'taken@example.com', invitedBy: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'INVITATION_CONFLICT' })

    expect(email.send).not.toHaveBeenCalled()
  })

  it('rejects when a live (pending) invitation already exists for the email', async () => {
    const repo = fakeAdminRepo({
      invitations: [makeInvitation({ email: 'pending@example.com', status: 'pending' })],
    })

    await expect(
      createInvitation(svcDeps(repo), { email: 'pending@example.com', invitedBy: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'INVITATION_CONFLICT' })
  })

  it('re-issues for an email whose prior pending invite has expired (flips stale → expired)', async () => {
    const stale = makeInvitation({
      email: 'lapsed@example.com',
      status: 'pending',
      expiresAt: new Date(FIXED_NOW.getTime() - 3600 * 1000), // expired
    })
    const repo = fakeAdminRepo({ invitations: [stale] })

    const fresh = await createInvitation(svcDeps(repo), {
      email: 'lapsed@example.com',
      invitedBy: 'admin-1',
    })

    expect(fresh.status).toBe('pending')
    expect(repo.state.invitations.find((i) => i.id === stale.id)?.status).toBe('expired')
    const pending = repo.state.invitations.filter((i) => i.status === 'pending')
    expect(pending).toHaveLength(1)
    expect(pending[0]?.id).toBe(fresh.id)
  })
})

describe('revokeInvitation', () => {
  it('transitions a pending invitation to revoked', async () => {
    const inv = makeInvitation({ status: 'pending' })
    const repo = fakeAdminRepo({ invitations: [inv] })

    await revokeInvitation(svcDeps(repo), inv.id)

    expect(repo.state.invitations.find((i) => i.id === inv.id)?.status).toBe('revoked')
  })

  it('throws invitation-invalid when the invitation is not pending', async () => {
    const inv = makeInvitation({ status: 'used' })
    const repo = fakeAdminRepo({ invitations: [inv] })

    await expect(revokeInvitation(svcDeps(repo), inv.id)).rejects.toMatchObject({
      code: 'INVITATION_INVALID',
    })
  })

  it('throws invitation-invalid for an unknown invitation id', async () => {
    const repo = fakeAdminRepo()

    await expect(revokeInvitation(svcDeps(repo), 'missing')).rejects.toMatchObject({
      code: 'INVITATION_INVALID',
    })
  })
})

describe('listInvitations', () => {
  it('filters by status', async () => {
    const repo = fakeAdminRepo({
      invitations: [
        makeInvitation({ status: 'pending', email: 'p@x.com' }),
        makeInvitation({ status: 'revoked', email: 'r@x.com' }),
      ],
    })

    const page = await listInvitations(svcDeps(repo), { status: 'pending', limit: 50 })

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.status).toBe('pending')
  })
})

describe('acceptInvitation', () => {
  function acceptDeps(repo: ReturnType<typeof fakeAdminRepo>): AcceptInvitationDeps {
    return {
      repo,
      now: () => FIXED_NOW,
      createAccount: vi.fn(async (input: { email: string }) => ({ id: `user-for-${input.email}` })),
    }
  }

  it('creates an account for a pending, unexpired invitation', async () => {
    const inv = makeInvitation({
      email: 'invitee@example.com',
      status: 'pending',
      expiresAt: new Date(FIXED_NOW.getTime() + 3600 * 1000),
    })
    const repo = fakeAdminRepo({ invitations: [inv] })
    const deps = acceptDeps(repo)

    const result = await acceptInvitation(deps, {
      invitationId: inv.id,
      name: 'Invitee',
      password: 'StrongPass123!',
    })

    expect(result.userId).toBe('user-for-invitee@example.com')
    expect(deps.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'invitee@example.com', name: 'Invitee' }),
    )
  })

  it('throws invitation-invalid for an expired invitation', async () => {
    const inv = makeInvitation({
      status: 'pending',
      expiresAt: new Date(FIXED_NOW.getTime() - 3600 * 1000),
    })
    const repo = fakeAdminRepo({ invitations: [inv] })
    const deps = acceptDeps(repo)

    await expect(
      acceptInvitation(deps, { invitationId: inv.id, name: 'X', password: 'StrongPass123!' }),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' })

    expect(deps.createAccount).not.toHaveBeenCalled()
  })

  it('throws invitation-invalid for an already-used invitation (single-use, FR-016)', async () => {
    const inv = makeInvitation({ status: 'used' })
    const repo = fakeAdminRepo({ invitations: [inv] })
    const deps = acceptDeps(repo)

    await expect(
      acceptInvitation(deps, { invitationId: inv.id, name: 'X', password: 'StrongPass123!' }),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' })
  })
})
