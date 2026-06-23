import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, SchemaError } from '../../../src/lib/api/_error'
import {
  deleteThread,
  fetchThreadMessages,
  fetchThreadMetadata,
  listThreads,
  updateThreadMetadata,
} from '../../../src/lib/api/threads'
import { jsonResponse } from './_fixtures'

// Thread operations go through the same-origin authenticated proxy
// (/api/memory/threads/**) — never to Mastra directly — so these assert the
// relative proxy paths.
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const STORED_THREAD = {
  id: 't_thread_1',
  title: 'Memórias',
  resourceId: 'r_owner',
  createdAt: '2026-04-27T00:00:00.000Z',
  updatedAt: '2026-04-27T01:00:00.000Z',
  metadata: { custom_title: 'Memórias', pinned: true },
}

describe('threads client (authenticated same-origin proxy)', () => {
  it('listThreads() returns Thread[] from { threads: [...] } envelope via the proxy', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ threads: [STORED_THREAD], total: 1, page: 0, perPage: 100, hasMore: false }),
    )
    const result = await listThreads()
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe(STORED_THREAD.id)
    expect(result[0]?.metadata).toEqual({ custom_title: 'Memórias', pinned: true })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/memory/threads')
  })

  it('listThreads() throws SchemaError when an entry is missing required fields', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ threads: [{ id: 't1' }] }))
    const err = await listThreads().catch((e) => e)
    expect(err).toBeInstanceOf(SchemaError)
  })

  it('deleteThread() DELETEs the proxy thread endpoint', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
    await deleteThread('t_thread_1')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/memory/threads/t_thread_1')
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE')
  })

  it('fetchThreadMessages() GETs the proxy messages endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [] }))
    await fetchThreadMessages('t_thread_1')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/memory/threads/t_thread_1/messages')
  })

  it('updateThreadMetadata() reads current metadata then PATCHes the proxy with a merged body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...STORED_THREAD,
        metadata: { custom_title: 'Memórias', pinned: false, book_ids: ['book-1'] },
      }),
    )
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...STORED_THREAD,
        metadata: { custom_title: 'Memórias', pinned: true, book_ids: ['book-1'] },
      }),
    )
    const result = await updateThreadMetadata('t_thread_1', { pinned: true })
    expect(result).toEqual({ custom_title: 'Memórias', pinned: true })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/memory/threads/t_thread_1')
    expect(fetchMock.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET')
    const patchInit = fetchMock.mock.calls[1]?.[1]
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/memory/threads/t_thread_1')
    expect(patchInit?.method).toBe('PATCH')
    const body = JSON.parse(patchInit?.body as string) as { metadata: Record<string, unknown> }
    // Existing keys preserved, only `pinned` overridden.
    expect(body.metadata).toEqual({ custom_title: 'Memórias', pinned: true, book_ids: ['book-1'] })
  })

  it('fetchThreadMetadata() returns defaults when the thread has no metadata', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...STORED_THREAD, metadata: undefined }))
    await expect(fetchThreadMetadata('t_thread_1')).resolves.toEqual({
      custom_title: null,
      pinned: false,
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/memory/threads/t_thread_1')
  })

  it('translates problem-details responses into ApiError with slug + status', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { type: 'urn:dialogus:problems:thread-not-found', title: 'Thread Not Found', status: 404 },
        { status: 404 },
      ),
    )
    const err = await deleteThread('missing').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as InstanceType<typeof ApiError>).status).toBe(404)
    expect((err as InstanceType<typeof ApiError>).slug).toBe('thread-not-found')
  })
})
