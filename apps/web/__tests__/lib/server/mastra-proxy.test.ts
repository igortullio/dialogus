import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mastraFetch } from '../../../src/lib/server/mastra-proxy'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('mastraFetch', () => {
  it('returns a clean 503 when Mastra is unreachable (no 500 stack)', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
    )

    const res = await mastraFetch('http://mastra:4111/api/memory/threads')

    expect(res.status).toBe(503)
    expect(((await res.json()) as { error: string }).error).toBe('mastra_unavailable')
  })

  it('passes through the upstream response when Mastra is reachable', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ threads: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const res = await mastraFetch('http://mastra:4111/api/memory/threads')

    expect(res.status).toBe(200)
  })
})
