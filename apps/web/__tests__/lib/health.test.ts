import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchHealth } from '../../src/lib/health'

const FALLBACK = { api: 'up', db: 'down', pgboss: 'down' } as const
const DEFAULT_BASE_URL = 'http://localhost:3001'

const fetchMock = vi.fn<typeof fetch>()
const originalEnvUrl = process.env.NEXT_PUBLIC_API_URL

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  process.env.NEXT_PUBLIC_API_URL = 'http://api.test'
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalEnvUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL
  } else {
    process.env.NEXT_PUBLIC_API_URL = originalEnvUrl
  }
})

describe('fetchHealth', () => {
  it('returns the parsed body on a schema-valid 200 response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ api: 'up', db: 'up', pgboss: 'up' }))

    await expect(fetchHealth()).resolves.toEqual({ api: 'up', db: 'up', pgboss: 'up' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns the fallback shape when fetch rejects (network error)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down'))

    await expect(fetchHealth()).resolves.toEqual(FALLBACK)
  })

  it('returns the fallback shape when the response status is non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ api: 'up', db: 'up', pgboss: 'up' }, { status: 500 }),
    )

    await expect(fetchHealth()).resolves.toEqual(FALLBACK)
  })

  it('returns the fallback shape when the body fails schema validation', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ foo: 'bar' }))

    await expect(fetchHealth()).resolves.toEqual(FALLBACK)
  })

  it('passes cache: "no-store" to fetch on every call', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ api: 'up', db: 'up', pgboss: 'up' }))

    await fetchHealth()

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/health', { cache: 'no-store' })
  })

  it('falls back to http://localhost:3001 when NEXT_PUBLIC_API_URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_API_URL
    fetchMock.mockResolvedValueOnce(jsonResponse({ api: 'up', db: 'up', pgboss: 'up' }))

    await fetchHealth()

    expect(fetchMock).toHaveBeenCalledWith(`${DEFAULT_BASE_URL}/health`, { cache: 'no-store' })
  })
})
