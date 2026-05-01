import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'

interface AnthropicContentBlock {
  readonly type: string
  readonly content?: unknown
  readonly text?: string
}

interface AnthropicMessage {
  readonly role: string
  readonly content?: string | AnthropicContentBlock[]
}

interface AnthropicRequestBody {
  readonly model: string
  readonly messages: AnthropicMessage[]
  readonly tools?: unknown[]
}

interface ToolResultPayload {
  readonly query?: string
  readonly book_ids?: readonly string[]
  readonly chunks?: ReadonlyArray<{
    readonly chunk_id?: string
    readonly chapter_ordinal?: number
    readonly text?: string
  }>
}

function readBlockText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content[0] as { text?: string } | undefined)?.text ?? ''
  }
  return ''
}

const BOOKS_PREFIX_RE = /^\[Available books: ([^\];]+)(?:; Spoiler caps: (\{[^}]*\}))?\]\n?/

function findUserText(body: AnthropicRequestBody): string {
  for (const message of body.messages) {
    if (message.role !== 'user') continue
    const raw =
      typeof message.content === 'string'
        ? message.content
        : (() => {
            for (const block of message.content ?? []) {
              if (block.type === 'text' && typeof block.text === 'string') return block.text
            }
            return ''
          })()
    return raw.replace(BOOKS_PREFIX_RE, '')
  }
  return ''
}

function getFirstUserText(body: AnthropicRequestBody): string {
  for (const message of body.messages) {
    if (message.role !== 'user') continue
    if (typeof message.content === 'string') return message.content
    for (const block of message.content ?? []) {
      if (block.type === 'text' && typeof block.text === 'string') return block.text
    }
  }
  return ''
}

function findBookIds(body: AnthropicRequestBody): string[] {
  const text = getFirstUserText(body)
  const match = BOOKS_PREFIX_RE.exec(text)
  if (match?.[1]) {
    return match[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

function findSpoilerCaps(body: AnthropicRequestBody): Record<string, number> | undefined {
  const text = getFirstUserText(body)
  const match = BOOKS_PREFIX_RE.exec(text)
  if (match?.[2]) {
    try {
      return JSON.parse(match[2]) as Record<string, number>
    } catch {
      return undefined
    }
  }
  return undefined
}

function findToolResult(body: AnthropicRequestBody): ToolResultPayload | null {
  for (const message of body.messages) {
    if (typeof message.content === 'string') continue
    for (const block of message.content ?? []) {
      if (block.type !== 'tool_result') continue
      const text = readBlockText((block as { content?: unknown }).content)
      if (text.length === 0) continue
      try {
        return JSON.parse(text) as ToolResultPayload
      } catch {
        return null
      }
    }
  }
  return null
}

function buildId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}`
}

function buildSseStream(events: Array<{ event: string; data: unknown }>): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const { event, data } of events) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
}

function toolUseResponse(input: Record<string, unknown>): Response {
  const msgId = buildId('msg')
  const toolId = buildId('toolu')
  const inputJson = JSON.stringify(input)
  return buildSseStream([
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: msgId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-haiku-4-5',
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 0 },
        },
      },
    },
    {
      event: 'content_block_start',
      data: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: toolId, name: 'semantic_search', input: {} },
      },
    },
    {
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: inputJson },
      },
    },
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
    {
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use', stop_sequence: null },
        usage: { output_tokens: 25 },
      },
    },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ])
}

function finalTextResponse(text: string): Response {
  const msgId = buildId('msg')
  return buildSseStream([
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: msgId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-haiku-4-5',
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 200, output_tokens: 0 },
        },
      },
    },
    {
      event: 'content_block_start',
      data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    },
    {
      event: 'content_block_delta',
      data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    },
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
    {
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 60 },
      },
    },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ])
}

function deriveResponseText(toolResult: ToolResultPayload): string {
  const chunks = toolResult.chunks ?? []
  if (chunks.length === 0) {
    return [
      'Não encontrei passagens relevantes sobre esse tema.',
      'Você poderia tentar:',
      '- Reformular a pergunta com termos mais próximos do texto.',
      '- Especificar um capítulo ou personagem do livro.',
    ].join('\n')
  }
  const firstWithChunkId = chunks.find((chunk) => typeof chunk.chunk_id === 'string')
  const chunkId = firstWithChunkId?.chunk_id
  if (!chunkId) {
    return 'Não consegui produzir uma citação verificável a partir das passagens encontradas.'
  }
  return `Trecho relevante encontrado no capítulo ${firstWithChunkId.chapter_ordinal ?? '?'} {{cite:${chunkId}}}.`
}

export interface MockAnthropicHandle {
  close(): void
}

export function activateAnthropicMock(): MockAnthropicHandle {
  const server = setupServer(
    http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
      let body: AnthropicRequestBody
      try {
        body = (await request.json()) as AnthropicRequestBody
      } catch {
        return HttpResponse.json({ error: 'invalid request body' }, { status: 400 })
      }
      const toolResult = findToolResult(body)
      if (toolResult === null) {
        const userText = findUserText(body)
        const bookIds = findBookIds(body)
        const spoilerCaps = findSpoilerCaps(body)
        const input: Record<string, unknown> = {
          query: userText.slice(0, 200),
          book_ids: bookIds,
          k: 5,
        }
        if (spoilerCaps !== undefined) input.spoiler_caps = spoilerCaps
        return toolUseResponse(input)
      }
      return finalTextResponse(deriveResponseText(toolResult))
    }),
  )
  server.listen({ onUnhandledRequest: 'bypass' })
  return {
    close(): void {
      server.close()
    },
  }
}

export const _internals = {
  ANTHROPIC_MESSAGES_URL,
  findToolResult,
  findUserText,
  findBookIds,
  findSpoilerCaps,
  deriveResponseText,
}
