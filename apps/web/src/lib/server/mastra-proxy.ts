import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth-session'

// Server-only Mastra base. The browser must NOT call Mastra directly; thread
// operations go through the authenticated Next route handlers in
// app/api/memory/threads/** which scope every call to the session user's
// resourceId. In production Mastra must be network-internal (not publicly
// reachable); Mastra server.auth is a defense-in-depth follow-up (T018).
const MASTRA = process.env.NEXT_PUBLIC_MASTRA_URL ?? 'http://localhost:4111'
const AGENT = 'dialogusAgent'

export const mastraThreadsUrl = `${MASTRA}/api/memory/threads`
export const mastraAgentId = AGENT

/** The authenticated user's id, or null when unauthenticated. */
export async function requireUserId(): Promise<string | null> {
  const session = await getServerSession()
  return session?.user.id ?? null
}

/** The `resourceId` (owner) of a Mastra thread, or null if missing/error. */
async function threadOwner(threadId: string): Promise<string | null> {
  const res = await fetch(`${mastraThreadsUrl}/${encodeURIComponent(threadId)}?agentId=${AGENT}`, {
    cache: 'no-store',
  })
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
