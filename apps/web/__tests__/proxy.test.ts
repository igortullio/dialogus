import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config, proxy } from '../src/proxy'

/** Next applies the matcher to the full pathname; emulate with an anchored regex. */
function matches(pathname: string): boolean {
  return new RegExp(`^${config.matcher[0]}$`).test(pathname)
}

describe('route-gate matcher', () => {
  it('gates app routes', () => {
    expect(matches('/')).toBe(true)
    expect(matches('/library')).toBe(true)
    expect(matches('/admin')).toBe(true)
  })

  it('excludes the public auth pages (no redirect loop / accept + reset reachable when signed out)', () => {
    expect(matches('/sign-in')).toBe(false)
    expect(matches('/reset-password')).toBe(false)
    expect(matches('/accept-invite')).toBe(false)
    // …and their subpaths, if any are ever added.
    expect(matches('/reset-password/confirm')).toBe(false)
  })

  it('still gates a route that merely SHARES a prefix with a public page (anchored exclusion)', () => {
    expect(matches('/reset-password-stats')).toBe(true)
    expect(matches('/sign-in-history')).toBe(true)
    expect(matches('/accept-invitee')).toBe(true)
    expect(matches('/apikeys')).toBe(true)
  })

  it('excludes Next internals, web API routes, and static files', () => {
    expect(matches('/_next/static/chunk.js')).toBe(false)
    expect(matches('/api/health')).toBe(false)
    expect(matches('/favicon.ico')).toBe(false)
  })
})

describe('proxy() gating', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('redirects an unauthenticated request to /sign-in preserving the return path', async () => {
    // No cookie → unauthenticated without even calling the API.
    const req = new NextRequest('http://localhost:3000/library')
    const res = await proxy(req)

    expect(res.status).toBe(307)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/sign-in')
    expect(location).toContain('redirect=%2Flibrary')
  })

  it('allows an authenticated request through', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 'u1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const req = new NextRequest('http://localhost:3000/library', {
      headers: { cookie: 'better-auth.session_token=abc' },
    })

    const res = await proxy(req)
    // NextResponse.next() has no redirect location.
    expect(res.headers.get('location')).toBeNull()
  })
})
