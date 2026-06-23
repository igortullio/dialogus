import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-session'

// Server-only Mastra base. The browser must NOT call Mastra directly; thread
// operations go through the authenticated Next route handlers in
// app/api/memory/threads/** which scope every call to the session user's
// resourceId. In production Mastra must be network-internal (not publicly
// reachable); Mastra server.auth is a defense-in-depth follow-up (T018).
const MASTRA = process.env.NEXT_PUBLIC_MASTRA_URL ?? 'http://localhost:4111'
const AGENT = 'dialogusAgent'
// Server-only shared secret. When set, Mastra's server middleware rejects any
// request that doesn't carry it (defense-in-depth, T018), so only these
// server-side proxies can reach Mastra. Unset in dev → no enforcement.
const MASTRA_AUTH_SECRET = process.env.MASTRA_AUTH_SECRET

export const mastraThreadsUrl = `${MASTRA}/api/memory/threads`
export const mastraAgentId = AGENT

/** fetch to Mastra with the internal auth header attached when configured. */
export async function mastraFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (MASTRA_AUTH_SECRET) headers.set('Authorization', `Bearer ${MASTRA_AUTH_SECRET}`)
  try {
    return await fetch(url, { ...init, headers })
  } catch {
    // Mastra is unreachable (e.g. still booting → ECONNREFUSED, or restarting).
    // Return a clean 503 instead of letting the route handler 500 with a fetch
    // stack trace; the client (React Query) retries until Mastra is up.
    return new NextResponse(JSON.stringify({ error: 'mastra_unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }
}

/** The authenticated user's id, or null when unauthenticated. */
export async function requireUserId(): Promise<string | null> {
  const session = await getServerSession()
  return session?.user.id ?? null
}

/** The `resourceId` (owner) of a Mastra thread, or null if missing/error. */
async function threadOwner(threadId: string): Promise<string | null> {
  const res = await mastraFetch(
    `${mastraThreadsUrl}/${encodeURIComponent(threadId)}?agentId=${AGENT}`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null
  const data = (await res.json().catch(() => null)) as { resourceId?: unknown } | null
  return data && typeof data.resourceId === 'string' ? data.resourceId : null
}

/**
 * Authorizes a per-thread operation: requires a session and that the thread is
 * owned by the session user (resourceId match). Returns the userId on success,
 * or a 401/404 Response to short-circuit. A non-owned or missing thread is 404
 * so existence is never leaked across users (SC-002).
 */
export async function authorizeThread(threadId: string): Promise<{ userId: string } | Response> {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const owner = await threadOwner(threadId)
  if (owner === null || owner !== userId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return { userId }
}

/** Mirrors a Mastra upstream response (status + body + content-type). */
export async function relay(upstream: Response): Promise<Response> {
  const body = await upstream.text()
  return new NextResponse(body.length > 0 ? body : null, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  })
}
