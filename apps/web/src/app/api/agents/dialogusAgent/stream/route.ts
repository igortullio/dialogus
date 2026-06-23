import type { NextRequest } from 'next/server'
import { mastraBaseUrl } from '@/lib/api/_envelope'
import { getServerSession } from '@/lib/auth-session'

const PREFIX_RE = /^\[Available books:[^\]]*\]\n?/

interface MastraPayload {
  id?: string
  text?: string
  toolCallId?: string
  toolName?: string
  argsTextDelta?: string
  args?: unknown
  result?: unknown
}

interface MastraEvent {
  type: string
  payload?: MastraPayload
}

function convertEvent(event: MastraEvent): Record<string, unknown> | null {
  const p = event.payload ?? {}
  switch (event.type) {
    case 'text-start':
      return { type: 'text-start', id: p.id }
    case 'text-delta':
      return { type: 'text-delta', id: p.id, delta: p.text }
    case 'text-end':
      return { type: 'text-end', id: p.id }
    case 'tool-call-input-streaming-start':
      return { type: 'tool-input-start', toolCallId: p.toolCallId, toolName: p.toolName }
    case 'tool-call-delta':
      return { type: 'tool-input-delta', toolCallId: p.toolCallId, inputTextDelta: p.argsTextDelta }
    case 'tool-call':
      return {
        type: 'tool-input-available',
        toolCallId: p.toolCallId,
        toolName: p.toolName,
        input: p.args,
      }
    case 'tool-result':
      return { type: 'tool-output-available', toolCallId: p.toolCallId, output: p.result }
    default:
      return null
  }
}

function stripBooksPrefix(text: string): string {
  return text.replace(PREFIX_RE, '')
}

function buildMastraBody(body: Record<string, unknown>): Record<string, unknown> {
  const bookIds = (body.book_ids as string[] | undefined) ?? []
  const spoilerCaps = (body.spoiler_caps as Record<string, number> | undefined) ?? {}
  const capsStr =
    Object.keys(spoilerCaps).length > 0 ? `; Spoiler caps: ${JSON.stringify(spoilerCaps)}` : ''
  const prefix = bookIds.length > 0 ? `[Available books: ${bookIds.join(', ')}${capsStr}]\n` : ''

  const rawMessage = typeof body.message === 'string' ? body.message : ''
  const cleanMessage = stripBooksPrefix(rawMessage)

  const rawMessages = Array.isArray(body.messages) ? body.messages : []
  const messages = rawMessages.map((m, i) => {
    if (i !== rawMessages.length - 1) return m
    const msg = m as { role: string; content: string }
    if (msg.role !== 'user') return m
    return { ...msg, content: `${prefix}${stripBooksPrefix(msg.content)}` }
  })

  return {
    ...body,
    message: `${prefix}${cleanMessage}`,
    messages,
  }
}

function parseSseLine(line: string): MastraEvent | null {
  if (!line.startsWith('data: ')) return null
  const data = line.slice(6).trim()
  if (data === '[DONE]') return null
  try {
    return JSON.parse(data) as MastraEvent
  } catch {
    return null
  }
}

function emitConverted(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: MastraEvent,
): void {
  const chunk = convertEvent(event)
  if (chunk === null) return
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
}

function pipeMastraStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let buffer = ''
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const event = parseSseLine(line)
            if (event !== null) emitConverted(controller, encoder, event)
          }
        }
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      }
    },
  })
}

export async function POST(req: NextRequest): Promise<Response> {
  // Conversations are private: only an authenticated user may stream, and the
  // thread owner (memory.resource) is bound to the session user server-side —
  // never trusted from the client body (FR-006, SC-002).
  const session = await getServerSession()
  if (!session) return new Response('unauthorized', { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return new Response('bad request', { status: 400 })
  }

  const mastraBody = buildMastraBody(body)
  const memory = (mastraBody.memory as Record<string, unknown> | undefined) ?? {}
  mastraBody.memory = { ...memory, resource: session.user.id }

  const mastraStream = `${mastraBaseUrl()}/api/agents/dialogusAgent/stream`

  let mastraRes: Response
  try {
    mastraRes = await fetch(mastraStream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mastraBody),
    })
  } catch {
    return new Response('upstream unavailable', { status: 502 })
  }

  if (!mastraRes.ok || !mastraRes.body) {
    return new Response(null, { status: mastraRes.status })
  }

  const convertedStream = pipeMastraStream(mastraRes.body as ReadableStream<Uint8Array>)

  return new Response(convertedStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
