import type { NextRequest } from 'next/server'
import {
  authorizeThread,
  mastraAgentId,
  mastraFetch,
  mastraThreadsUrl,
  relay,
} from '@/lib/server/mastra-proxy'

interface Ctx {
  params: Promise<{ threadId: string }>
}

/** Read a thread's message history — only if owned by the session user. */
export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const { threadId } = await ctx.params
  const auth = await authorizeThread(threadId)
  if (auth instanceof Response) return auth
  const url = `${mastraThreadsUrl}/${encodeURIComponent(threadId)}/messages?agentId=${mastraAgentId}`
  return relay(await mastraFetch(url, { cache: 'no-store' }))
}
