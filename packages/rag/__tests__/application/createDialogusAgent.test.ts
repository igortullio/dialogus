import * as fs from 'node:fs'
import { Agent } from '@mastra/core/agent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type AgentDeps,
  createDialogusAgent,
  DIALOGUS_AGENT_ID,
  DIALOGUS_AGENT_NAME,
  type DialogusAgentLogger,
} from '../../src/application/createDialogusAgent'
import { FIND_CHARACTER_MENTIONS_TOOL_ID } from '../../src/application/tools/findCharacterMentions'
import { GET_CHAPTER_SUMMARY_TOOL_ID } from '../../src/application/tools/getChapterSummary'
import { LIST_CHAPTERS_TOOL_ID } from '../../src/application/tools/listChapters'
import { SEMANTIC_SEARCH_TOOL_ID } from '../../src/application/tools/semanticSearch'
import type { ChapterReadRepository } from '../../src/domain/ports/ChapterReadRepository.port'
import type { ChapterSummaryReadRepository } from '../../src/domain/ports/ChapterSummaryReadRepository.port'
import type { ChunkReadRepository } from '../../src/domain/ports/ChunkReadRepository.port'
import type { QueryEmbedder } from '../../src/domain/ports/QueryEmbedder.port'
import { _resetSystemPromptCache, loadSystemPrompt } from '../../src/prompts/loader'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
  }
})

function makeLogger(): DialogusAgentLogger {
  return {
    info: vi.fn(),
    error: vi.fn(),
  }
}

function makeChunkRepo(): ChunkReadRepository {
  return {
    searchSemantic: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    findCharacterMentions: vi.fn(async () => []),
  }
}

function makeChapterRepo(): ChapterReadRepository {
  return {
    listByBook: vi.fn(async () => []),
    findById: vi.fn(async () => null),
  }
}

function makeChapterSummaryRepo(): ChapterSummaryReadRepository {
  return {
    findByChapterId: vi.fn(async () => null),
  }
}

function makeQueryEmbedder(): QueryEmbedder {
  return {
    dimensions: 1536,
    modelName: 'mock-query-embedder',
    embed: vi.fn(async () => Array.from({ length: 1536 }, () => 0)),
  }
}

function makeDeps(modelId: AgentDeps['modelId'] = 'claude-haiku-4-5'): AgentDeps {
  return {
    chunkRepo: makeChunkRepo(),
    chapterRepo: makeChapterRepo(),
    chapterSummaryRepo: makeChapterSummaryRepo(),
    queryEmbedder: makeQueryEmbedder(),
    logger: makeLogger(),
    modelId,
  }
}

beforeEach(() => {
  _resetSystemPromptCache()
  vi.mocked(fs.readFileSync).mockClear()
})

afterEach(() => {
  _resetSystemPromptCache()
})

describe('createDialogusAgent — identity + tools', () => {
  it('returns a Mastra Agent with the canonical id and name', () => {
    const agent = createDialogusAgent(makeDeps())
    expect(agent).toBeInstanceOf(Agent)
    expect(agent.id).toBe(DIALOGUS_AGENT_ID)
    expect(agent.name).toBe(DIALOGUS_AGENT_NAME)
  })

  it('registers exactly the four canonical tools by id', async () => {
    const agent = createDialogusAgent(makeDeps())
    const tools = await agent.listTools()
    const toolIds = Object.keys(tools).sort()
    expect(toolIds).toEqual(
      [
        SEMANTIC_SEARCH_TOOL_ID,
        LIST_CHAPTERS_TOOL_ID,
        GET_CHAPTER_SUMMARY_TOOL_ID,
        FIND_CHARACTER_MENTIONS_TOOL_ID,
      ].sort(),
    )
  })
})

describe('createDialogusAgent — model selection', () => {
  it("selects the Haiku model when modelId is 'claude-haiku-4-5'", async () => {
    const agent = createDialogusAgent(makeDeps('claude-haiku-4-5'))
    const model = await agent.getModel()
    expect(model.modelId).toBe('claude-haiku-4-5')
  })

  it("selects the Sonnet model when modelId is 'claude-sonnet-4-6'", async () => {
    const agent = createDialogusAgent(makeDeps('claude-sonnet-4-6'))
    const model = await agent.getModel()
    expect(model.modelId).toBe('claude-sonnet-4-6')
  })
})

describe('createDialogusAgent — system prompt + caching', () => {
  it("attaches the loaded system prompt to the agent's instructions", async () => {
    const agent = createDialogusAgent(makeDeps())
    const prompt = loadSystemPrompt()
    const head = prompt.slice(0, 100)
    const instructions = await agent.getInstructions()
    const content = extractSystemContent(instructions)
    expect(content).toContain(head)
  })

  it('configures Anthropic ephemeral cache_control on the system prompt', async () => {
    const agent = createDialogusAgent(makeDeps())
    const instructions = await agent.getInstructions()
    const cacheControl = extractCacheControl(instructions)
    expect(cacheControl).toEqual({ type: 'ephemeral' })
  })

  it('reads the system prompt from disk only once across two factory calls', () => {
    createDialogusAgent(makeDeps())
    createDialogusAgent(makeDeps())
    const calls = vi
      .mocked(fs.readFileSync)
      .mock.calls.filter(([path]) => typeof path === 'string' && path.endsWith('system.md'))
    expect(calls).toHaveLength(1)
  })
})

describe('createDialogusAgent — purity / idempotence', () => {
  it('produces structurally-equivalent agents for identical deps', async () => {
    const depsA = makeDeps()
    const depsB = makeDeps()
    const agentA = createDialogusAgent(depsA)
    const agentB = createDialogusAgent(depsB)

    expect(agentA.id).toBe(agentB.id)
    expect(agentA.name).toBe(agentB.name)

    const [toolsA, toolsB, modelA, modelB, instructionsA, instructionsB] = await Promise.all([
      agentA.listTools(),
      agentB.listTools(),
      agentA.getModel(),
      agentB.getModel(),
      agentA.getInstructions(),
      agentB.getInstructions(),
    ])

    expect(Object.keys(toolsA).sort()).toEqual(Object.keys(toolsB).sort())
    expect(modelA.modelId).toBe(modelB.modelId)
    expect(extractSystemContent(instructionsA)).toBe(extractSystemContent(instructionsB))
    expect(extractCacheControl(instructionsA)).toEqual(extractCacheControl(instructionsB))
  })
})

function extractSystemContent(instructions: unknown): string {
  if (typeof instructions === 'string') return instructions
  if (Array.isArray(instructions)) {
    return instructions.map(extractSystemContent).join('')
  }
  if (
    instructions &&
    typeof instructions === 'object' &&
    'content' in instructions &&
    typeof (instructions as { content: unknown }).content === 'string'
  ) {
    return (instructions as { content: string }).content
  }
  return ''
}

function extractCacheControl(instructions: unknown): unknown {
  if (!instructions || typeof instructions !== 'object') return undefined
  if (Array.isArray(instructions)) {
    for (const item of instructions) {
      const found = extractCacheControl(item)
      if (found !== undefined) return found
    }
    return undefined
  }
  const providerOptions = (instructions as { providerOptions?: Record<string, unknown> })
    .providerOptions
  if (!providerOptions || typeof providerOptions !== 'object') return undefined
  const anthropic = (providerOptions as { anthropic?: Record<string, unknown> }).anthropic
  if (!anthropic || typeof anthropic !== 'object') return undefined
  return (anthropic as { cacheControl?: unknown }).cacheControl
}
