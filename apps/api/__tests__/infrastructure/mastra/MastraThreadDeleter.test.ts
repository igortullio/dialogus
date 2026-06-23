import { describe, expect, it, vi } from 'vitest'
import { MastraThreadDeleter } from '../../../src/infrastructure/mastra/MastraThreadDeleter'

/**
 * Mastra's `GET /api/memory/threads` returns a PAGINATED OBJECT
 * `{ threads: [...], total, page, perPage, hasMore }` — not a bare array (the web
 * client parses `.threads` the same way). These tests pin that shape + paging.
 */
function listPage(threads: Array<{ id: string }>, hasMore: boolean, page = 0): Response {
  return new Response(
    JSON.stringify({ threads, total: threads.length, page, perPage: 100, hasMore }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  )
}

describe('MastraThreadDeleter', () => {
  it('lists the user threads (paginated object) by resourceId then deletes each', async () => {
    const calls: Array<{ url: string; method: string }> = []
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      calls.push({ url: u, method: init?.method ?? 'GET' })
      if (init?.method === 'DELETE') return new Response(null, { status: 200 })
      return listPage([{ id: 't1' }, { id: 't2' }], false)
    }) as unknown as typeof fetch

    const deleter = new MastraThreadDeleter({
      baseUrl: 'http://mastra:4111',
      agentId: 'dialogusAgent',
      authSecret: 'secret',
      fetchImpl,
    })

    await deleter.deleteThreadsForUser('user-7')

    const list = calls.find((c) => c.method === 'GET')
    expect(list?.url).toContain('/api/memory/threads?resourceId=user-7')
    expect(list?.url).toContain('agentId=dialogusAgent')
    const deletes = calls.filter((c) => c.method === 'DELETE').map((c) => c.url)
    expect(deletes).toHaveLength(2)
    expect(deletes[0]).toContain('/api/memory/threads/t1')
    expect(deletes[1]).toContain('/api/memory/threads/t2')
  })

  it('follows pagination (hasMore) so no thread is left behind', async () => {
    const deleted: string[] = []
    const listUrls: string[] = []
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      if (init?.method === 'DELETE') {
        deleted.push(u)
        return new Response(null, { status: 200 })
      }
      listUrls.push(u)
      // page 0 → one thread, more pages; page 1 → last thread, done.
      return u.includes('page=1')
        ? listPage([{ id: 't2' }], false, 1)
        : listPage([{ id: 't1' }], true, 0)
    }) as unknown as typeof fetch

    const deleter = new MastraThreadDeleter({
      baseUrl: 'http://mastra:4111',
      agentId: 'dialogusAgent',
      fetchImpl,
    })

    await deleter.deleteThreadsForUser('user-7')

    expect(listUrls).toHaveLength(2) // two pages fetched
    expect(deleted.some((u) => u.includes('/t1'))).toBe(true)
    expect(deleted.some((u) => u.includes('/t2'))).toBe(true)
  })

  it('attaches the internal Bearer secret when configured', async () => {
    let authHeader: string | null = null
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      authHeader = new Headers(init?.headers).get('authorization')
      return listPage([], false)
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
    const fetchImpl = vi.fn(async () => listPage([], false)) as unknown as typeof fetch
    const deleter = new MastraThreadDeleter({
      baseUrl: 'http://mastra:4111',
      agentId: 'dialogusAgent',
      fetchImpl,
    })

    await deleter.deleteThreadsForUser('user-7')

    expect(fetchImpl).toHaveBeenCalledTimes(1) // single list page, no deletes
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
