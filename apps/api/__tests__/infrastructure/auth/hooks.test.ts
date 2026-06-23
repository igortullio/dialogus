import { describe, expect, it } from 'vitest'
import { createAllowlistHooks } from '../../../src/infrastructure/auth/hooks'
import { fakeAdminRepo, makeInvitation } from '../../_helpers/fakeAdminRepo'

const FUTURE = new Date('2026-12-31T00:00:00.000Z')

describe('user.create.before (allowlist gate, FR-014/FR-016)', () => {
  it('allows creation when an open invitation exists for the email', async () => {
    const repo = fakeAdminRepo({
      invitations: [makeInvitation({ email: 'invited@example.com', expiresAt: FUTURE })],
    })
    const hooks = createAllowlistHooks({ repo })

    const user = { id: 'u1', email: 'invited@example.com', role: 'member' }
    const result = await hooks.user.create.before(user, undefined)

    expect(result).toEqual({ data: user })
    expect(repo.state.events).toHaveLength(0)
  })

  it('rejects and audits unauthorized_signup_attempt for an uninvited member email (FR-005)', async () => {
    const repo = fakeAdminRepo()
    const hooks = createAllowlistHooks({ repo })

    await expect(
      hooks.user.create.before(
        { id: 'u2', email: 'stranger@example.com', role: 'member' },
        undefined,
      ),
    ).rejects.toThrow()

    expect(repo.state.events).toEqual([
      expect.objectContaining({
        eventType: 'unauthorized_signup_attempt',
        email: 'stranger@example.com',
      }),
    ])
  })

  it('allows admin creation without an invitation (out-of-band owner/admin bootstrap)', async () => {
    const repo = fakeAdminRepo()
    const hooks = createAllowlistHooks({ repo })

    const user = { id: 'owner', email: 'owner@dialogus.test', role: 'admin' }
    const result = await hooks.user.create.before(user, undefined)

    expect(result).toEqual({ data: user })
    expect(repo.state.events).toHaveLength(0)
  })

  it('normalizes the email before the allowlist lookup', async () => {
    const repo = fakeAdminRepo({
      invitations: [makeInvitation({ email: 'invited@example.com', expiresAt: FUTURE })],
    })
    const hooks = createAllowlistHooks({ repo })

    const user = { id: 'u3', email: 'Invited@Example.com', role: 'member' }
    const result = await hooks.user.create.before(user, undefined)

    expect(result).toEqual({ data: user })
  })
})

describe('user.create.after (consume + audit)', () => {
  it('consumes the matching invitation and audits account_created', async () => {
    const inv = makeInvitation({ email: 'invited@example.com', expiresAt: FUTURE })
    const repo = fakeAdminRepo({ invitations: [inv] })
    const hooks = createAllowlistHooks({ repo })

    await hooks.user.create.after(
      { id: 'u1', email: 'Invited@Example.com', role: 'member' },
      undefined,
    )

    expect(repo.state.invitations.find((i) => i.id === inv.id)?.status).toBe('used')
    expect(repo.state.invitations.find((i) => i.id === inv.id)?.consumedByUserId).toBe('u1')
    expect(repo.state.events).toEqual([
      expect.objectContaining({ eventType: 'account_created', userId: 'u1' }),
    ])
  })
})

describe('session.create.after (sign-in audit)', () => {
  it('audits sign_in for the session user', async () => {
    const repo = fakeAdminRepo()
    const hooks = createAllowlistHooks({ repo })

    await hooks.session.create.after({ id: 's1', userId: 'u1' }, undefined)

    expect(repo.state.events).toEqual([
      expect.objectContaining({ eventType: 'sign_in', userId: 'u1' }),
    ])
  })
})
