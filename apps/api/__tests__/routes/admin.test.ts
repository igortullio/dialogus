import { PROBLEM_TYPE_PREFIX } from '@dialogus/shared/http/problem'
import { Hono } from 'hono'
import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import {
  createProblemMiddleware,
  type ProblemVariables,
} from '../../src/infrastructure/http/middleware/problem'
import { type AdminRouteDeps, createAdminRoute } from '../../src/infrastructure/http/routes/admin'
import { fakeAuth } from '../_helpers/auth'
import { fakeAdminRepo, makeInvitation, makeMember } from '../_helpers/fakeAdminRepo'

const ADMIN_ID = 'admin-1'

function recordingEmail() {
  const sent: Array<{ to: string; subject: string }> = []
  return {
    sent,
    provider: {
      async send(input: { to: string; subject: string; html: string; text?: string }) {
        sent.push({ to: input.to, subject: input.subject })
      },
    },
  }
}

function noopThreads() {
  const deleted: string[] = []
  return { deleted, deleteThreadsForUser: async (id: string) => void deleted.push(id) }
}

function buildApp(
  repo: ReturnType<typeof fakeAdminRepo>,
  overrides: Partial<AdminRouteDeps> = {},
): Hono<{ Variables: ProblemVariables }> {
  const app = new Hono<{ Variables: ProblemVariables }>()
  app.use('*', createProblemMiddleware({ logger: pino({ level: 'silent' }) }))
  app.route(
    '/admin',
    createAdminRoute({
      auth: fakeAuth(ADMIN_ID, 'admin'),
      repo,
      email: recordingEmail().provider,
      appUrl: 'https://app.test',
      threads: noopThreads(),
      ...overrides,
    }),
  )
  return app
}

function post(app: Hono<{ Variables: ProblemVariables }>, path: string, body?: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('POST /admin/invitations', () => {
  it('creates a pending invitation and returns 201 with the DTO', async () => {
    const repo = fakeAdminRepo()
    const email = recordingEmail()
    const app = buildApp(repo, { email: email.provider })

    const res = await post(app, '/admin/invitations', { email: 'new@test.local' })
    const body = (await res.json()) as { data: { email: string; status: string } }

    expect(res.status).toBe(201)
    expect(body.data.email).toBe('new@test.local')
    expect(body.data.status).toBe('pending')
    expect(email.sent).toHaveLength(1)
  })

  it('returns 409 invitation-conflict when a live invitation exists', async () => {
    const repo = fakeAdminRepo({
      invitations: [makeInvitation({ email: 'dup@test.local', status: 'pending' })],
    })
    const app = buildApp(repo)

    const res = await post(app, '/admin/invitations', { email: 'dup@test.local' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(409)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}invitation-conflict`)
  })

  it('returns 400 validation-failed for a malformed email', async () => {
    const app = buildApp(fakeAdminRepo())

    const res = await post(app, '/admin/invitations', { email: 'not-an-email' })

    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).type).toBe(
      `${PROBLEM_TYPE_PREFIX}validation-failed`,
    )
  })
})

describe('GET /admin/invitations', () => {
  it('returns an envelope of invitations with a count', async () => {
    const repo = fakeAdminRepo({
      invitations: [
        makeInvitation({ email: 'a@test.local' }),
        makeInvitation({ email: 'b@test.local' }),
      ],
    })
    const app = buildApp(repo)

    const res = await app.request('/admin/invitations')
    const body = (await res.json()) as { data: unknown[] }

    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(2)
  })

  it('filters by status', async () => {
    const repo = fakeAdminRepo({
      invitations: [
        makeInvitation({ status: 'pending', email: 'p@test.local' }),
        makeInvitation({ status: 'revoked', email: 'r@test.local' }),
      ],
    })
    const app = buildApp(repo)

    const res = await app.request('/admin/invitations?status=revoked')
    const body = (await res.json()) as { data: Array<{ status: string }> }

    expect(body.data).toHaveLength(1)
    expect(body.data[0]?.status).toBe('revoked')
  })

  it('preserves the status filter in the next-page link (cursor pagination)', async () => {
    const repo = fakeAdminRepo({
      invitations: [
        makeInvitation({ status: 'revoked', email: 'r1@test.local' }),
        makeInvitation({ status: 'revoked', email: 'r2@test.local' }),
      ],
    })
    const app = buildApp(repo)

    const res = await app.request('/admin/invitations?status=revoked&limit=1')
    const body = (await res.json()) as { data: unknown[]; links?: { next?: string } }

    expect(body.data).toHaveLength(1)
    expect(body.links?.next).toBeTruthy()
    expect(body.links?.next).toContain('status=revoked')
    expect(body.links?.next).toContain('cursor=')
  })
})

describe('DELETE /admin/invitations/:id', () => {
  it('revokes a pending invitation (204)', async () => {
    const inv = makeInvitation({ status: 'pending' })
    const repo = fakeAdminRepo({ invitations: [inv] })
    const app = buildApp(repo)

    const res = await app.request(`/admin/invitations/${inv.id}`, { method: 'DELETE' })

    expect(res.status).toBe(204)
    expect(repo.state.invitations.find((i) => i.id === inv.id)?.status).toBe('revoked')
  })

  it('returns 410 invitation-invalid for a non-pending invitation', async () => {
    const inv = makeInvitation({ status: 'used' })
    const repo = fakeAdminRepo({ invitations: [inv] })
    const app = buildApp(repo)

    const res = await app.request(`/admin/invitations/${inv.id}`, { method: 'DELETE' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(410)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}invitation-invalid`)
  })
})

describe('GET /admin/members', () => {
  it('returns an envelope of members', async () => {
    const repo = fakeAdminRepo({
      members: [makeMember({ id: ADMIN_ID, role: 'admin' }), makeMember({ id: 'm1' })],
    })
    const app = buildApp(repo)

    const res = await app.request('/admin/members')
    const body = (await res.json()) as { data: Array<{ id: string; role: string }> }

    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(2)
  })
})

describe('member access control', () => {
  it('revokes a member (200, banned)', async () => {
    const repo = fakeAdminRepo({
      members: [makeMember({ id: ADMIN_ID, role: 'admin' }), makeMember({ id: 'm1' })],
    })
    const app = buildApp(repo)

    const res = await post(app, '/admin/members/m1/revoke')
    const body = (await res.json()) as { data: { banned: boolean } }

    expect(res.status).toBe(200)
    expect(body.data.banned).toBe(true)
    expect(repo.state.deletedSessionsFor).toContain('m1')
  })

  it('returns 409 last-admin when revoking the only admin', async () => {
    const repo = fakeAdminRepo({ members: [makeMember({ id: ADMIN_ID, role: 'admin' })] })
    const app = buildApp(repo)

    const res = await post(app, `/admin/members/${ADMIN_ID}/revoke`)
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(409)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}last-admin`)
  })

  it('restores a member (200, not banned)', async () => {
    const repo = fakeAdminRepo({
      members: [
        makeMember({ id: ADMIN_ID, role: 'admin' }),
        makeMember({ id: 'm1', banned: true }),
      ],
    })
    const app = buildApp(repo)

    const res = await post(app, '/admin/members/m1/restore')
    const body = (await res.json()) as { data: { banned: boolean } }

    expect(res.status).toBe(200)
    expect(body.data.banned).toBe(false)
  })

  it('changes a role (200)', async () => {
    const repo = fakeAdminRepo({
      members: [
        makeMember({ id: ADMIN_ID, role: 'admin' }),
        makeMember({ id: 'm1', role: 'member' }),
      ],
    })
    const app = buildApp(repo)

    const res = await post(app, '/admin/members/m1/role', { role: 'admin' })
    const body = (await res.json()) as { data: { role: string } }

    expect(res.status).toBe(200)
    expect(body.data.role).toBe('admin')
  })

  it('returns 409 last-admin when demoting the only admin', async () => {
    const repo = fakeAdminRepo({ members: [makeMember({ id: ADMIN_ID, role: 'admin' })] })
    const app = buildApp(repo)

    const res = await post(app, `/admin/members/${ADMIN_ID}/role`, { role: 'member' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(409)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}last-admin`)
  })

  it('returns 404 member-not-found for an unknown member', async () => {
    const repo = fakeAdminRepo({ members: [makeMember({ id: ADMIN_ID, role: 'admin' })] })
    const app = buildApp(repo)

    const res = await post(app, '/admin/members/ghost/revoke')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(404)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}member-not-found`)
  })

  it('deletes a member account (204) — threads removed + user deleted (FR-023)', async () => {
    const repo = fakeAdminRepo({
      members: [makeMember({ id: ADMIN_ID, role: 'admin' }), makeMember({ id: 'm1' })],
    })
    const threads = noopThreads()
    const app = buildApp(repo, { threads })

    const res = await app.request('/admin/members/m1', { method: 'DELETE' })

    expect(res.status).toBe(204)
    expect(threads.deleted).toContain('m1')
    expect(repo.state.deletedUsers).toContain('m1')
  })

  it('returns 409 last-admin when deleting the only admin (a different one than the actor)', async () => {
    // The sole admin in the table is `sole-admin`; the acting admin is ADMIN_ID,
    // so this reaches the last-admin guard rather than the self-delete guard.
    const repo = fakeAdminRepo({ members: [makeMember({ id: 'sole-admin', role: 'admin' })] })
    const app = buildApp(repo)

    const res = await app.request('/admin/members/sole-admin', { method: 'DELETE' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(409)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}last-admin`)
  })

  it('refuses self-deletion from the admin console (403 forbidden)', async () => {
    const repo = fakeAdminRepo({
      members: [
        makeMember({ id: ADMIN_ID, role: 'admin' }),
        makeMember({ id: 'admin-2', role: 'admin' }),
      ],
    })
    const threads = noopThreads()
    const app = buildApp(repo, { threads })

    // ADMIN_ID is the authenticated actor (fakeAuth) — deleting itself is refused
    // even though a second admin means the last-admin guard wouldn't trip.
    const res = await app.request(`/admin/members/${ADMIN_ID}`, { method: 'DELETE' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(403)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}forbidden`)
    expect(threads.deleted).toHaveLength(0)
    expect(repo.state.deletedUsers).toHaveLength(0)
  })
})

describe('admin auth gate', () => {
  it('returns 403 forbidden for a non-admin session', async () => {
    const repo = fakeAdminRepo()
    const app = buildApp(repo, { auth: fakeAuth('member-1', 'member') })

    const res = await app.request('/admin/invitations')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(403)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}forbidden`)
  })

  it('returns 401 unauthorized for an anonymous session', async () => {
    const repo = fakeAdminRepo()
    const anonAuth = { api: { getSession: async () => null } } as unknown as AdminRouteDeps['auth']
    const app = buildApp(repo, { auth: anonAuth })

    const res = await app.request('/admin/invitations')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(401)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}unauthorized`)
  })
})
