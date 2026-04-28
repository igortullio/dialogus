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

function findUserText(body: AnthropicRequestBody): string {
  for (const message of body.messages) {
    if (message.role !== 'user') continue
    if (typeof message.content === 'string') return message.content
    for (const block of message.content ?? []) {
      if (block.type === 'text' && typeof block.text === 'string') return block.text
    }
  }
  return ''
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

function toolUseResponse(input: Record<string, unknown>): Response {
  return HttpResponse.json({
    type: 'message',
    id: buildId('msg'),
    role: 'assistant',
    model: 'claude-haiku-4-5',
    content: [
      {
        type: 'tool_use',
        id: buildId('toolu'),
        name: 'semantic_search',
        input,
      },
    ],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 25 },
  })
}

function finalTextResponse(text: string): Response {
  return HttpResponse.json({
    type: 'message',
    id: buildId('msg'),
    role: 'assistant',
    model: 'claude-haiku-4-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 200, output_tokens: 60 },
  })
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
        return toolUseResponse({
          query: userText.slice(0, 200),
          book_ids: [],
          k: 5,
        })
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
  deriveResponseText,
}
