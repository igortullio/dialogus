import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchLibraryCountByStatus } from '../../src/lib/library'

const FALLBACK = { total: 0, ready: 0 } as const
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

describe('fetchLibraryCountByStatus', () => {
  it('returns total + ready from the two meta.count payloads', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [], meta: { count: 3 } }))
      .mockResolvedValueOnce(jsonResponse({ data: [], meta: { count: 2 } }))

    await expect(fetchLibraryCountByStatus()).resolves.toEqual({ total: 3, ready: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://api.test/api/library/books?limit=1', {
      cache: 'no-store',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/library/books?status=ready&limit=1',
      { cache: 'no-store' },
    )
  })

  it('returns the fallback when one fetch rejects', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ meta: { count: 5 } }))
      .mockRejectedValueOnce(new TypeError('network down'))

    await expect(fetchLibraryCountByStatus()).resolves.toEqual(FALLBACK)
  })

  it('returns the fallback when both fetches reject', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'))

    await expect(fetchLibraryCountByStatus()).resolves.toEqual(FALLBACK)
  })

  it('returns the fallback when a response is non-2xx', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ meta: { count: 1 } }))
      .mockResolvedValueOnce(jsonResponse({ meta: { count: 1 } }, { status: 503 }))

    await expect(fetchLibraryCountByStatus()).resolves.toEqual(FALLBACK)
  })

  it('returns the fallback when meta.count is missing from a payload', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ meta: { count: 4 } }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))

    await expect(fetchLibraryCountByStatus()).resolves.toEqual(FALLBACK)
  })

  it('returns the fallback when meta.count is not a non-negative integer', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ meta: { count: 'four' } }))
      .mockResolvedValueOnce(jsonResponse({ meta: { count: 1 } }))

    await expect(fetchLibraryCountByStatus()).resolves.toEqual(FALLBACK)
  })

  it('starts both fetches in parallel before either resolves', async () => {
    let resolveTotal!: (value: Response) => void
    let resolveReady!: (value: Response) => void
    const totalPromise = new Promise<Response>((resolve) => {
      resolveTotal = resolve
    })
    const readyPromise = new Promise<Response>((resolve) => {
      resolveReady = resolve
    })
    fetchMock.mockReturnValueOnce(totalPromise).mockReturnValueOnce(readyPromise)

    const resultPromise = fetchLibraryCountByStatus()

    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    resolveTotal(jsonResponse({ meta: { count: 3 } }))
    resolveReady(jsonResponse({ meta: { count: 2 } }))

    await expect(resultPromise).resolves.toEqual({ total: 3, ready: 2 })
  })

  it('passes cache: "no-store" to every fetch call', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ meta: { count: 0 } }))
      .mockResolvedValueOnce(jsonResponse({ meta: { count: 0 } }))

    await fetchLibraryCountByStatus()

    for (const call of fetchMock.mock.calls) {
      expect(call[1]).toEqual({ cache: 'no-store' })
    }
  })

  it('falls back to http://localhost:3001 when NEXT_PUBLIC_API_URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_API_URL
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ meta: { count: 0 } }))
      .mockResolvedValueOnce(jsonResponse({ meta: { count: 0 } }))

    await fetchLibraryCountByStatus()

    expect(fetchMock).toHaveBeenNthCalledWith(1, `${DEFAULT_BASE_URL}/api/library/books?limit=1`, {
      cache: 'no-store',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${DEFAULT_BASE_URL}/api/library/books?status=ready&limit=1`,
      { cache: 'no-store' },
    )
  })
})
