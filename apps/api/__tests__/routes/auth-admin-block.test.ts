import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../../src/infrastructure/auth/auth'
import { createAuthRoute } from '../../src/infrastructure/http/routes/auth'

/**
 * Security regression (US3 review): the Better Auth admin plugin registers its
 * own management REST endpoints (`/admin/set-role`, `/admin/ban-user`,
 * `/admin/remove-user`, `/admin/create-user`, …) under the auth handler. Those
 * bypass the app's last-admin guard (FR-017) and invite-only allowlist, so the
 * mount must NOT expose them — every admin operation goes through the guarded
 * `/api/admin/*` routes instead.
 */
function fakeAuthWithHandler() {
  const handler = vi.fn(async () => new Response('AUTH_HANDLED', { status: 200 }))
  return { handler } as unknown as Auth & { handler: typeof handler }
}

describe('createAuthRoute — admin plugin endpoints are blocked', () => {
  it.each([
    ['POST', '/admin/set-role'],
    ['POST', '/admin/ban-user'],
    ['POST', '/admin/remove-user'],
    ['POST', '/admin/create-user'],
    ['GET', '/admin/list-users'],
  ])('returns 404 for %s %s without reaching the auth handler', async (method, path) => {
    const auth = fakeAuthWithHandler()
    const app = new Hono()
    app.route('/api/auth', createAuthRoute(auth))

    const res = await app.request(`/api/auth${path}`, { method })

    expect(res.status).toBe(404)
    expect(auth.handler).not.toHaveBeenCalled()
  })

  it('still forwards normal auth endpoints to the Better Auth handler', async () => {
    const auth = fakeAuthWithHandler()
    const app = new Hono()
    app.route('/api/auth', createAuthRoute(auth))

    const res = await app.request('/api/auth/sign-in/email', { method: 'POST' })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('AUTH_HANDLED')
    expect(auth.handler).toHaveBeenCalledTimes(1)
  })

  it('forwards the get-session endpoint (used by SSR session reads)', async () => {
    const auth = fakeAuthWithHandler()
    const app = new Hono()
    app.route('/api/auth', createAuthRoute(auth))

    const res = await app.request('/api/auth/get-session', { method: 'GET' })

    expect(res.status).toBe(200)
    expect(auth.handler).toHaveBeenCalledTimes(1)
  })
})
