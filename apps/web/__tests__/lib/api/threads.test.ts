import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse } from './_fixtures'

const API_BASE = 'http://api.test'
const MASTRA_BASE = 'http://mastra.test'
const fetchMock = vi.fn<typeof fetch>()
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL
const originalMastraUrl = process.env.NEXT_PUBLIC_MASTRA_URL

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  process.env.NEXT_PUBLIC_API_URL = API_BASE
  process.env.NEXT_PUBLIC_MASTRA_URL = MASTRA_BASE
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.doUnmock('../../../src/lib/feature-flags')
  if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL
  else process.env.NEXT_PUBLIC_API_URL = originalApiUrl
  if (originalMastraUrl === undefined) delete process.env.NEXT_PUBLIC_MASTRA_URL
  else process.env.NEXT_PUBLIC_MASTRA_URL = originalMastraUrl
})

async function loadThreads(flag: boolean) {
  vi.doMock('../../../src/lib/feature-flags', () => ({
    MASTRA_THREAD_METADATA_AVAILABLE: flag,
  }))
  const threads = await import('../../../src/lib/api/threads')
  const errors = await import('../../../src/lib/api/_error')
  return { ...threads, ApiError: errors.ApiError, SchemaError: errors.SchemaError }
}

const STORED_THREAD = {
  id: 't_thread_1',
  title: 'Memórias',
  resourceId: 'r_owner',
  createdAt: '2026-04-27T00:00:00.000Z',
  updatedAt: '2026-04-27T01:00:00.000Z',
  metadata: { custom_title: 'Memórias', pinned: true },
}

describe('threads client (Mastra primary path)', () => {
  it('listThreads() returns Thread[] from { threads: [...] } envelope', async () => {
    const { listThreads } = await loadThreads(true)
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ threads: [STORED_THREAD], total: 1, page: 0, perPage: 100, hasMore: false }),
    )
    const result = await listThreads()
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe(STORED_THREAD.id)
    expect(result[0]?.metadata).toEqual({ custom_title: 'Memórias', pinned: true })
    expect(fetchMock).toHaveBeenCalledWith(`${MASTRA_BASE}/api/memory/threads`, expect.any(Object))
  })

  it('listThreads() throws SchemaError when an entry is missing required fields', async () => {
    const { listThreads, SchemaError } = await loadThreads(true)
    fetchMock.mockResolvedValueOnce(jsonResponse({ threads: [{ id: 't1' }] }))
    const err = await listThreads().catch((e) => e)
    expect(err).toBeInstanceOf(SchemaError)
  })

  it('deleteThread() calls DELETE on the Mastra endpoint', async () => {
    const { deleteThread } = await loadThreads(true)
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
    await deleteThread('t_thread_1')
    const init = fetchMock.mock.calls[0]?.[1]
    expect(init?.method).toBe('DELETE')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${MASTRA_BASE}/api/memory/threads/t_thread_1?agentId=dialogusAgent`,
    )
  })

  it('updateThreadMetadata() PATCHes Mastra with merged { custom_title, pinned } body', async () => {
    const { updateThreadMetadata } = await loadThreads(true)
    fetchMock.mockResolvedValueOnce(jsonResponse(STORED_THREAD))
    const result = await updateThreadMetadata('t_thread_1', { pinned: true })
    expect(result).toEqual({ custom_title: 'Memórias', pinned: true })
    const init = fetchMock.mock.calls[0]?.[1]
    expect(init?.method).toBe('PATCH')
    const body = JSON.parse(init?.body as string) as { metadata: Record<string, unknown> }
    expect(body.metadata).toEqual({ custom_title: null, pinned: true })
  })

  it('fetchThreadMetadata() returns defaults when the thread has no metadata', async () => {
    const { fetchThreadMetadata } = await loadThreads(true)
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...STORED_THREAD, metadata: undefined }))
    await expect(fetchThreadMetadata('t_thread_1')).resolves.toEqual({
      custom_title: null,
      pinned: false,
    })
  })

  it('translates problem-details responses into ApiError with slug + status', async () => {
    const { deleteThread, ApiError } = await loadThreads(true)
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          type: 'urn:dialogus:problems:thread-not-found',
          title: 'Thread Not Found',
          status: 404,
        },
        { status: 404 },
      ),
    )
    const err = await deleteThread('missing').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as InstanceType<typeof ApiError>).status).toBe(404)
    expect((err as InstanceType<typeof ApiError>).slug).toBe('thread-not-found')
  })
})

describe('threads client (apps/api fallback path)', () => {
  it('updateThreadMetadata() PUTs the apps/api fallback endpoint', async () => {
    const { updateThreadMetadata } = await loadThreads(false)
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { custom_title: 'X', pinned: true } }))
    await updateThreadMetadata('t_thread_1', { pinned: true })
    const url = fetchMock.mock.calls[0]?.[0] as string
    const init = fetchMock.mock.calls[0]?.[1]
    expect(url).toBe(`${API_BASE}/api/library/threads/t_thread_1/metadata`)
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(init?.body as string)).toEqual({ pinned: true })
  })

  it('fetchThreadMetadata() GETs the apps/api fallback endpoint', async () => {
    const { fetchThreadMetadata } = await loadThreads(false)
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { custom_title: 'My Title', pinned: false } }),
    )
    await expect(fetchThreadMetadata('t_thread_1')).resolves.toEqual({
      custom_title: 'My Title',
      pinned: false,
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE}/api/library/threads/t_thread_1/metadata`)
  })

  it('listThreads() reads from the apps/api fallback envelope', async () => {
    const { listThreads } = await loadThreads(false)
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [STORED_THREAD], meta: { count: 1 } }))
    const result = await listThreads()
    expect(result).toHaveLength(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE}/api/library/threads`)
  })
})
