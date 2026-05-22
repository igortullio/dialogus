import { spawnSync } from 'node:child_process'
import {
  CITATION_MARKER_REGEX,
  createDialogusAgent,
  DIALOGUS_AGENT_ID,
  type DialogusAgentLogger,
  MockQueryEmbedder,
} from '@dialogus/rag'
import { Mastra } from '@mastra/core'
import { PostgresStore } from '@mastra/pg'
import { HttpResponse, http } from 'msw'
import { type SetupServer, setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  DialogusChapterReadAdapter,
  DialogusChapterSummaryReadAdapter,
  DialogusChunkReadAdapter,
} from '../../src/persistence'
import {
  clearAllSeededData,
  type PostgresContext,
  type SeededBook,
  seedFixtures,
  startPostgres,
  stopPostgres,
} from './_helpers/seed'

const dockerAvailable = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}']).status === 0

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'

interface AnthropicContentBlock {
  readonly type: string
  readonly content?: unknown
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

function hasToolResult(body: AnthropicRequestBody): boolean {
  for (const message of body.messages) {
    if (typeof message.content === 'string') continue
    for (const block of message.content ?? []) {
      if (block.type === 'tool_result') return true
    }
  }
  return false
}

function readBlockText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content[0] as { text?: string } | undefined)?.text ?? ''
  }
  return ''
}

function extractToolResultPayload<T>(body: AnthropicRequestBody): T | null {
  for (const message of body.messages) {
    if (typeof message.content === 'string') continue
    for (const block of message.content ?? []) {
      if (block.type !== 'tool_result') continue
      const text = readBlockText((block as { content?: unknown }).content)
      if (text) return JSON.parse(text) as T
    }
  }
  return null
}

const noopLogger = {
  info: vi.fn(),
  error: vi.fn(),
} satisfies DialogusAgentLogger

interface AgentRuntime {
  readonly agent: Awaited<ReturnType<Mastra['getAgent']>>
  readonly storage: PostgresStore
}

async function buildAgentRuntime(pg: PostgresContext): Promise<AgentRuntime> {
  const agent = createDialogusAgent({
    chunkRepo: new DialogusChunkReadAdapter(pg.db),
    chapterRepo: new DialogusChapterReadAdapter(pg.db),
    chapterSummaryRepo: new DialogusChapterSummaryReadAdapter(pg.db),
    queryEmbedder: new MockQueryEmbedder(),
    logger: noopLogger,
    modelProvider: 'anthropic',
    modelId: 'claude-haiku-4-5',
  })
  const storage = new PostgresStore({
    id: 'dialogus-mastra-pg-test',
    connectionString: pg.databaseUrl,
  })
  const mastra = new Mastra({
    storage,
    agents: { [DIALOGUS_AGENT_ID]: agent },
  })
  const resolvedAgent = await mastra.getAgent(DIALOGUS_AGENT_ID)
  return { agent: resolvedAgent, storage }
}

function makeMessageId(): string {
  return `msg_${Math.random().toString(36).slice(2, 10)}`
}

function makeToolUseId(): string {
  return `toolu_${Math.random().toString(36).slice(2, 12)}`
}

function toolUseResponse(input: Record<string, unknown>) {
  return HttpResponse.json({
    type: 'message',
    id: makeMessageId(),
    role: 'assistant',
    model: 'claude-haiku-4-5',
    content: [
      {
        type: 'tool_use',
        id: makeToolUseId(),
        name: 'semantic_search',
        input,
      },
    ],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 25 },
  })
}

function finalTextResponse(text: string) {
  return HttpResponse.json({
    type: 'message',
    id: makeMessageId(),
    role: 'assistant',
    model: 'claude-haiku-4-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 200, output_tokens: 60 },
  })
}

describe.skipIf(!dockerAvailable)(
  'agent-conversation integration — Mastra agent + MSW Anthropic',
  () => {
    let pg: PostgresContext
    let server: SetupServer
    let runtime: AgentRuntime

    beforeAll(async () => {
      pg = await startPostgres()
      server = setupServer()
      server.listen({ onUnhandledRequest: 'error' })
      process.env.ANTHROPIC_API_KEY = 'test-key'
      runtime = await buildAgentRuntime(pg)
    }, 240_000)

    afterAll(async () => {
      server?.close()
      if (runtime) await runtime.storage.close()
      if (pg) await stopPostgres(pg)
    })

    afterEach(async () => {
      server.resetHandlers()
      await clearAllSeededData(pg.db)
    })

    it('runs the tool_use loop end-to-end and emits a {{cite:<chunk_id>}} marker referencing a real chunk id', async () => {
      const seeded = await seedFixtures(pg.db, [
        {
          title: 'Citation Book',
          chapterCount: 3,
          chunksPerChapter: 2,
          chunkText: (chapter, chunk) => `citation book chapter ${chapter} chunk ${chunk} content`,
        },
      ])
      const book = seeded.books[0] as SeededBook
      const targetText = book.chunkTexts[1]?.[0] as string
      interface CapturedToolOutput {
        readonly chunks: { readonly chunk_id: string }[]
      }
      const captured: { value: CapturedToolOutput | null } = { value: null }

      server.use(
        http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
          const body = (await request.json()) as AnthropicRequestBody
          if (!hasToolResult(body)) {
            return toolUseResponse({
              query: targetText,
              book_ids: [book.bookId],
              k: 3,
            })
          }
          captured.value = extractToolResultPayload<CapturedToolOutput>(body)
          const chunkId = captured.value?.chunks[0]?.chunk_id
          return finalTextResponse(
            `O capítulo destacado contém uma passagem relevante {{cite:${chunkId}}}.`,
          )
        }),
      )

      const { agent } = runtime
      expect(agent.id).toBe(DIALOGUS_AGENT_ID)
      const result = await agent.generate('Onde aparece a passagem destacada?')
      const text = result.text
      expect(typeof text).toBe('string')
      expect(captured.value).not.toBeNull()
      const observedChunkIds = (captured.value?.chunks ?? []).map((c) => c.chunk_id)
      expect(observedChunkIds.length).toBeGreaterThan(0)
      const matches = [...text.matchAll(CITATION_MARKER_REGEX)]
      expect(matches.length).toBeGreaterThan(0)
      const markerChunkId = matches[0]?.[1] as string
      expect(observedChunkIds).toContain(markerChunkId)
      const seededChunkIds = book.chunkIds.flat()
      expect(seededChunkIds).toContain(markerChunkId)
    })

    it('refusal path: empty retrieval triggers a refusal message with reformulation hints and no citation marker', async () => {
      await seedFixtures(pg.db, [
        {
          title: 'Refusal Book',
          chapterCount: 2,
          chunksPerChapter: 1,
          chunkText: (chapter, chunk) => `refusal book chapter ${chapter} chunk ${chunk} content`,
        },
      ])
      interface CapturedRefusalOutput {
        readonly chunks: unknown[]
      }
      const captured: { value: CapturedRefusalOutput | null } = { value: null }
      const emptyBookId = '00000000-0000-4000-8000-000000000001'

      server.use(
        http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
          const body = (await request.json()) as AnthropicRequestBody
          if (!hasToolResult(body)) {
            return toolUseResponse({
              query: 'completely-unrelated-topic-not-in-the-seed',
              book_ids: [emptyBookId],
              k: 5,
            })
          }
          captured.value = extractToolResultPayload<CapturedRefusalOutput>(body)
          return finalTextResponse(
            [
              'Não encontrei passagens relevantes sobre esse tema.',
              'Você poderia tentar:',
              '- Reformular a pergunta com termos mais próximos do texto.',
              '- Especificar um capítulo ou personagem do livro.',
              '- Buscar por uma cena específica que recorde do livro.',
            ].join('\n'),
          )
        }),
      )

      const { agent } = runtime
      const result = await agent.generate('Pergunta totalmente fora do escopo')
      const text = result.text

      expect(captured.value).not.toBeNull()
      expect(captured.value?.chunks ?? []).toEqual([])

      const matches = [...text.matchAll(CITATION_MARKER_REGEX)]
      expect(matches).toHaveLength(0)

      const reformulationLines = text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('- ') || line.startsWith('* '))
      expect(reformulationLines.length).toBeGreaterThanOrEqual(2)
    })
  },
)
