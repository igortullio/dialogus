import type { NextRequest } from 'next/server'
import { mastraBaseUrl } from '@/lib/api/_envelope'

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

export async function POST(req: NextRequest): Promise<Response> {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return new Response('bad request', { status: 400 })
  }

  const mastraBody = buildMastraBody(body)

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

  const encoder = new TextEncoder()
  let buffer = ''

  const convertedStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Safe assertion: the outer handler returned early above when body is null.
      const reader = (mastraRes.body as ReadableStream<Uint8Array>).getReader()
      const decoder = new TextDecoder()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            try {
              const event = JSON.parse(data) as MastraEvent
              const chunk = convertEvent(event)
              if (chunk !== null) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
              }
            } catch {
              // ignore malformed lines
            }
          }
        }
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      }
    },
  })

  return new Response(convertedStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
