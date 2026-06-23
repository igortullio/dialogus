import { describe, expect, it, vi } from 'vitest'
import { MastraThreadDeleter } from '../../../src/infrastructure/mastra/MastraThreadDeleter'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('MastraThreadDeleter', () => {
  it('lists the user threads by resourceId then deletes each', async () => {
    const calls: Array<{ url: string; method: string }> = []
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      calls.push({ url: u, method: init?.method ?? 'GET' })
      if (init?.method === 'DELETE') return new Response(null, { status: 200 })
      return jsonResponse([{ id: 't1' }, { id: 't2' }])
    }) as unknown as typeof fetch

    const deleter = new MastraThreadDeleter({
      baseUrl: 'http://mastra:4111',
      agentId: 'dialogusAgent',
      authSecret: 'secret',
      fetchImpl,
    })

    await deleter.deleteThreadsForUser('user-7')

    // One list (GET, scoped to resourceId) + one DELETE per thread.
    const list = calls.find((c) => c.method === 'GET')
    expect(list?.url).toContain('/api/memory/threads?resourceId=user-7')
    expect(list?.url).toContain('agentId=dialogusAgent')
    const deletes = calls.filter((c) => c.method === 'DELETE').map((c) => c.url)
    expect(deletes).toHaveLength(2)
    expect(deletes[0]).toContain('/api/memory/threads/t1')
    expect(deletes[1]).toContain('/api/memory/threads/t2')
  })

  it('attaches the internal Bearer secret when configured', async () => {
    let authHeader: string | null = null
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      authHeader = new Headers(init?.headers).get('authorization')
      return jsonResponse([])
    }) as unknown as typeof fetch

    const deleter = new MastraThreadDeleter({
      baseUrl: 'http://mastra:4111',
      agentId: 'dialogusAgent',
      authSecret: 'top-secret',
      fetchImpl,
    })

    await deleter.deleteThreadsForUser('user-7')

    expect(authHeader).toBe('Bearer top-secret')
  })

  it('does nothing when the user has no threads', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([])) as unknown as typeof fetch
    const deleter = new MastraThreadDeleter({
      baseUrl: 'http://mastra:4111',
      agentId: 'dialogusAgent',
      fetchImpl,
    })

    await deleter.deleteThreadsForUser('user-7')

    expect(fetchImpl).toHaveBeenCalledTimes(1) // list only
  })

  it('tolerates a 404 on delete (already gone) but throws on a list failure', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'DELETE') return new Response(null, { status: 404 })
      return new Response('boom', { status: 500 })
    }) as unknown as typeof fetch

    const deleter = new MastraThreadDeleter({
      baseUrl: 'http://mastra:4111',
      agentId: 'dialogusAgent',
      fetchImpl,
    })

    await expect(deleter.deleteThreadsForUser('user-7')).rejects.toThrow()
  })
})
