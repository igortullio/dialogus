import { NextResponse } from 'next/server'
import {
  mastraAgentId,
  mastraFetch,
  mastraThreadsUrl,
  relay,
  requireUserId,
} from '@/lib/server/mastra-proxy'

/**
 * List the authenticated user's threads. resourceId is injected server-side
 * from the session — the client never supplies it — so a user can only ever
 * see their own conversations (FR-006, fixes the all-users `listThreads` leak).
 */
export async function GET(): Promise<Response> {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = `${mastraThreadsUrl}?resourceId=${encodeURIComponent(userId)}&agentId=${mastraAgentId}`
  return relay(await mastraFetch(url, { cache: 'no-store' }))
}
