import { PROBLEM_TYPE_PREFIX } from '@dialogus/shared/http/problem'
import { APIError } from 'better-auth/api'
import { Hono } from 'hono'
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import {
  createProblemMiddleware,
  type ProblemVariables,
} from '../../src/infrastructure/http/middleware/problem'
import {
  createInvitationsRoute,
  type InvitationsRouteDeps,
} from '../../src/infrastructure/http/routes/invitations'
import { fakeAdminRepo, makeInvitation } from '../_helpers/fakeAdminRepo'

const FUTURE = new Date('2026-12-31T00:00:00.000Z')

function buildApp(
  repo: ReturnType<typeof fakeAdminRepo>,
  createAccount: InvitationsRouteDeps['createAccount'] = vi.fn(async () => ({ id: 'new-user' })),
): Hono<{ Variables: ProblemVariables }> {
  const app = new Hono<{ Variables: ProblemVariables }>()
  app.use('*', createProblemMiddleware({ logger: pino({ level: 'silent' }) }))
  app.route('/invitations', createInvitationsRoute({ repo, createAccount }))
  return app
}

function postAccept(app: Hono<{ Variables: ProblemVariables }>, body: unknown) {
  return app.request('/invitations/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /invitations/:id', () => {
  it('returns the email + status for an open invitation', async () => {
    const inv = makeInvitation({
      email: 'invitee@test.local',
      status: 'pending',
      expiresAt: FUTURE,
    })
    const app = buildApp(fakeAdminRepo({ invitations: [inv] }))

    const res = await app.request(`/invitations/${inv.id}`)
    const body = (await res.json()) as { data: { email: string; status: string } }

    expect(res.status).toBe(200)
    expect(body.data.email).toBe('invitee@test.local')
    expect(body.data.status).toBe('pending')
  })

  it('returns 410 invitation-invalid for a used invitation', async () => {
    const inv = makeInvitation({ status: 'used' })
    const app = buildApp(fakeAdminRepo({ invitations: [inv] }))

    const res = await app.request(`/invitations/${inv.id}`)
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(410)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}invitation-invalid`)
  })

  it('returns 410 invitation-invalid for an unknown invitation', async () => {
    const app = buildApp(fakeAdminRepo())

    const res = await app.request('/invitations/00000000-0000-4000-8000-000000000000')

    expect(res.status).toBe(410)
  })
})

describe('POST /invitations/accept', () => {
  it('provisions an account for a valid invitation (201)', async () => {
    const inv = makeInvitation({
      email: 'invitee@test.local',
      status: 'pending',
      expiresAt: FUTURE,
    })
    const createAccount = vi.fn(async () => ({ id: 'user-xyz' }))
    const app = buildApp(fakeAdminRepo({ invitations: [inv] }), createAccount)

    const res = await postAccept(app, {
      invitation: inv.id,
      name: 'Invitee',
      password: 'StrongPass123!',
    })
    const body = (await res.json()) as { data: { user_id: string } }

    expect(res.status).toBe(201)
    expect(body.data.user_id).toBe('user-xyz')
    expect(createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'invitee@test.local', name: 'Invitee' }),
    )
  })

  it('returns 410 invitation-invalid for an expired invitation', async () => {
    const inv = makeInvitation({
      status: 'pending',
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    })
    const createAccount = vi.fn(async () => ({ id: 'nope' }))
    const app = buildApp(fakeAdminRepo({ invitations: [inv] }), createAccount)

    const res = await postAccept(app, { invitation: inv.id, name: 'X', password: 'StrongPass123!' })

    expect(res.status).toBe(410)
    expect(createAccount).not.toHaveBeenCalled()
  })

  it('maps a Better Auth APIError from account creation to invitation-invalid (410, race)', async () => {
    const inv = makeInvitation({ status: 'pending', expiresAt: FUTURE })
    const createAccount = vi.fn(async () => {
      throw new APIError('FORBIDDEN', { message: 'No valid invitation exists for this email' })
    })
    const app = buildApp(fakeAdminRepo({ invitations: [inv] }), createAccount)

    const res = await postAccept(app, {
      invitation: inv.id,
      name: 'Race',
      password: 'StrongPass123!',
    })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(410)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}invitation-invalid`)
  })

  it('returns 400 validation-failed for a too-short password', async () => {
    const inv = makeInvitation({ status: 'pending', expiresAt: FUTURE })
    const app = buildApp(fakeAdminRepo({ invitations: [inv] }))

    const res = await postAccept(app, { invitation: inv.id, name: 'X', password: 'short' })

    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).type).toBe(
      `${PROBLEM_TYPE_PREFIX}validation-failed`,
    )
  })
})
