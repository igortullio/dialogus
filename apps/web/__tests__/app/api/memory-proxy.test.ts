import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the session authority used by the proxy + stream route handlers.
vi.mock('../../../src/lib/auth-session', () => ({
  getServerSession: vi.fn(),
}))

const { getServerSession } = await import('../../../src/lib/auth-session')
const { GET: listGET } = await import('../../../src/app/api/memory/threads/route')
const threadRoute = await import('../../../src/app/api/memory/threads/[threadId]/route')
const { GET: messagesGET } = await import(
  '../../../src/app/api/memory/threads/[threadId]/messages/route'
)
const { POST: streamPOST } = await import('../../../src/app/api/agents/dialogusAgent/stream/route')

const mockedSession = vi.mocked(getServerSession)
const fetchMock = vi.fn<typeof fetch>()

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function ctx(threadId: string) {
  return { params: Promise.resolve({ threadId }) }
}

function asUser(id: string) {
  mockedSession.mockResolvedValue({
    user: { id, email: `${id}@x.test`, name: id, role: 'member' },
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  mockedSession.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('thread proxy — per-user isolation (FR-006, SC-002)', () => {
  it('list: rejects unauthenticated requests with 401', async () => {
    mockedSession.mockResolvedValue(null)
    const res = await listGET()
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('list: scopes the Mastra query to the session user resourceId', async () => {
    asUser('u1')
    fetchMock.mockResolvedValueOnce(json({ threads: [] }))
    const res = await listGET()
    expect(res.status).toBe(200)
    const calledUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(calledUrl).toContain('resourceId=u1')
    expect(calledUrl).toContain('/api/memory/threads')
  })

  it('get: returns 404 for a thread owned by another user (no existence leak)', async () => {
    asUser('u1')
    // ownership probe → thread belongs to u2
    fetchMock.mockResolvedValueOnce(json({ id: 't1', resourceId: 'u2' }))
    const res = await threadRoute.GET({} as never, ctx('t1'))
    expect(res.status).toBe(404)
    // only the ownership probe ran — no second forward
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('get: forwards when the thread is owned by the session user', async () => {
    asUser('u1')
    fetchMock.mockResolvedValueOnce(json({ id: 't1', resourceId: 'u1' })) // ownership probe
    fetchMock.mockResolvedValueOnce(json({ id: 't1', resourceId: 'u1', title: 'Mine' })) // forward
    const res = await threadRoute.GET({} as never, ctx('t1'))
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('delete: blocks deleting another user thread with 404 and never forwards the DELETE', async () => {
    asUser('u1')
    fetchMock.mockResolvedValueOnce(json({ id: 't1', resourceId: 'u2' }))
    const res = await threadRoute.DELETE({} as never, ctx('t1'))
    expect(res.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  })

  it('delete: forwards a DELETE for an owned thread', async () => {
    asUser('u1')
    fetchMock.mockResolvedValueOnce(json({ id: 't1', resourceId: 'u1' }))
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
    const res = await threadRoute.DELETE({} as never, ctx('t1'))
    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE')
  })

  it('patch: forwards the body only for an owned thread', async () => {
    asUser('u1')
    fetchMock.mockResolvedValueOnce(json({ id: 't1', resourceId: 'u1' }))
    fetchMock.mockResolvedValueOnce(json({ id: 't1', resourceId: 'u1' }))
    const req = { text: async () => '{"metadata":{"pinned":true}}' } as never
    const res = await threadRoute.PATCH(req, ctx('t1'))
    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('PATCH')
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe('{"metadata":{"pinned":true}}')
  })

  it('messages: 404 for another user thread; 200 for owned', async () => {
    asUser('u1')
    fetchMock.mockResolvedValueOnce(json({ id: 't1', resourceId: 'u2' }))
    expect((await messagesGET({} as never, ctx('t1'))).status).toBe(404)

    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce(json({ id: 't1', resourceId: 'u1' }))
    fetchMock.mockResolvedValueOnce(json({ messages: [] }))
    expect((await messagesGET({} as never, ctx('t1'))).status).toBe(200)
  })
})

describe('stream proxy — binds memory.resource to the session user', () => {
  it('rejects unauthenticated streaming with 401', async () => {
    mockedSession.mockResolvedValue(null)
    const req = { json: async () => ({ message: 'hi' }) } as never
    const res = await streamPOST(req)
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('injects memory.resource = userId server-side (never trusts the client body)', async () => {
    asUser('u1')
    fetchMock.mockResolvedValueOnce(
      new Response(new ReadableStream(), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    )
    const req = {
      json: async () => ({ message: 'hi', memory: { thread: 't1', resource: 'attacker' } }),
    } as never
    const res = await streamPOST(req)
    expect(res.status).toBe(200)
    const sentBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      memory?: { resource?: string }
    }
    expect(sentBody.memory?.resource).toBe('u1')
  })
})
