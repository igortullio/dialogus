import type { NextRequest } from 'next/server'
import { authorizeThread, mastraAgentId, mastraThreadsUrl, relay } from '@/lib/server/mastra-proxy'

interface Ctx {
  params: Promise<{ threadId: string }>
}

function threadUrl(threadId: string): string {
  return `${mastraThreadsUrl}/${encodeURIComponent(threadId)}?agentId=${mastraAgentId}`
}

/** Read a single thread's metadata — only if owned by the session user. */
export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const { threadId } = await ctx.params
  const auth = await authorizeThread(threadId)
  if (auth instanceof Response) return auth
  return relay(await fetch(threadUrl(threadId), { cache: 'no-store' }))
}

/** Delete a thread — only the owner may delete it (FR-006). */
export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const { threadId } = await ctx.params
  const auth = await authorizeThread(threadId)
  if (auth instanceof Response) return auth
  return relay(await fetch(threadUrl(threadId), { method: 'DELETE' }))
}

/** Update thread metadata (rename/pin) — only the owner may patch it. */
export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { threadId } = await ctx.params
  const auth = await authorizeThread(threadId)
  if (auth instanceof Response) return auth
  const body = await req.text()
  return relay(
    await fetch(threadUrl(threadId), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  )
}
