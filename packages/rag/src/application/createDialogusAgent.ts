import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { Agent } from '@mastra/core/agent'
import type { MastraCompositeStore } from '@mastra/core/storage'
import { Memory } from '@mastra/memory'
import type { ChapterReadRepository } from '../domain/ports/ChapterReadRepository.port'
import type { ChapterSummaryReadRepository } from '../domain/ports/ChapterSummaryReadRepository.port'
import type { ChunkReadRepository } from '../domain/ports/ChunkReadRepository.port'
import type { QueryEmbedder } from '../domain/ports/QueryEmbedder.port'
import { loadSystemPrompt } from '../prompts/loader'
import {
  FIND_CHARACTER_MENTIONS_TOOL_ID,
  type FindCharacterMentionsLogger,
  findCharacterMentionsTool,
} from './tools/findCharacterMentions'
import {
  GET_CHAPTER_SUMMARY_TOOL_ID,
  type GetChapterSummaryLogger,
  getChapterSummaryTool,
} from './tools/getChapterSummary'
import {
  LIST_CHAPTERS_TOOL_ID,
  type ListChaptersLogger,
  listChaptersTool,
} from './tools/listChapters'
import {
  SEMANTIC_SEARCH_TOOL_ID,
  type SemanticSearchLogger,
  semanticSearchTool,
} from './tools/semanticSearch'

export const DIALOGUS_AGENT_ID = 'dialogusAgent'
export const DIALOGUS_AGENT_NAME = 'Dialogus Agent'

export type AnthropicAgentModelId = 'claude-haiku-4-5' | 'claude-sonnet-4-6'
export type OpenAIAgentModelId = 'gpt-4o-mini' | 'gpt-4o' | 'gpt-5-mini'
export type DialogusAgentModelId = AnthropicAgentModelId | OpenAIAgentModelId
export type DialogusAgentProvider = 'anthropic' | 'openai'

export type DialogusAgentLogger = SemanticSearchLogger &
  ListChaptersLogger &
  GetChapterSummaryLogger &
  FindCharacterMentionsLogger

export interface AgentDeps {
  readonly chunkRepo: ChunkReadRepository
  readonly chapterRepo: ChapterReadRepository
  readonly chapterSummaryRepo: ChapterSummaryReadRepository
  readonly queryEmbedder: QueryEmbedder
  readonly logger: DialogusAgentLogger
  readonly modelProvider: DialogusAgentProvider
  readonly modelId: string
  /**
   * Optional storage adapter for the agent's `Memory`. Pass a
   * `PostgresStore` (or any `MastraCompositeStore`) to persist threads and
   * messages. When omitted, an in-memory default Memory is used.
   *
   * Typed as `unknown` because pnpm peer resolution can produce two copies
   * of `@mastra/core` and `@mastra/pg`, whose private brand identities make
   * the storage instance from one workspace incompatible with the type from
   * another. Construction happens here (inside @dialogus/rag) on purpose so
   * the `Memory` and storage end up in the same module resolution.
   */
  readonly memoryStorage?: unknown
}

export function createDialogusAgent(deps: AgentDeps): Agent {
  const tools = {
    [SEMANTIC_SEARCH_TOOL_ID]: semanticSearchTool({
      chunkRepo: deps.chunkRepo,
      queryEmbedder: deps.queryEmbedder,
      logger: deps.logger,
    }),
    [LIST_CHAPTERS_TOOL_ID]: listChaptersTool({
      chapterRepo: deps.chapterRepo,
      logger: deps.logger,
    }),
    [GET_CHAPTER_SUMMARY_TOOL_ID]: getChapterSummaryTool({
      chapterSummaryRepo: deps.chapterSummaryRepo,
      logger: deps.logger,
    }),
    [FIND_CHARACTER_MENTIONS_TOOL_ID]: findCharacterMentionsTool({
      chunkRepo: deps.chunkRepo,
      logger: deps.logger,
    }),
  }
  // OpenAI ignores provider-specific Anthropic options like `cacheControl`
  // (they pass through unread). Anthropic actively uses them for ephemeral
  // prompt caching, which is the dominant cost-saver for our long system
  // prompt. Keeping them set on both providers is safe.
  const model = deps.modelProvider === 'openai' ? openai(deps.modelId) : anthropic(deps.modelId)
  return new Agent({
    id: DIALOGUS_AGENT_ID,
    name: DIALOGUS_AGENT_NAME,
    instructions: {
      role: 'system',
      content: loadSystemPrompt(),
      providerOptions: {
        anthropic: {
          cacheControl: { type: 'ephemeral' },
        },
      },
    },
    model,
    tools,
    memory:
      deps.memoryStorage !== undefined
        ? new Memory({
            storage: deps.memoryStorage as MastraCompositeStore,
            options: {
              // Async title generation using the agent's own model. Mastra
              // overwrites the placeholder title (set on thread create) with
              // a derived one shortly after the first user/assistant turn.
              generateTitle: true,
            },
          })
        : new Memory(),
    // Bound the agent loop so a single turn can't spiral into many tool
    // rounds — each round replays prior tool outputs to the model and the
    // input-token bill grows quadratically. 4 iterations covers up to 3 tool
    // calls + 1 final composition, which fits the low-tier Anthropic 50k
    // input-tokens-per-minute window for Haiku.
    //
    // prepareStep forces the FIRST step to make a tool call (toolChoice:
    // 'required') and lets subsequent steps fall back to 'auto' so the model
    // can compose the final answer after retrieving. Without this, gpt-4o-mini
    // routinely ignores the §2 grounding contract on famous works (it has
    // Monte Cristo / Moby Dick / Brás Cubas in training and "knows" the
    // answer, so it skips retrieval and hallucinates chapter numbers).
    // Setting toolChoice: 'required' globally would loop forever (model
    // never gets to write prose), hence the per-step gate.
    defaultOptions: {
      maxSteps: 4,
      prepareStep: ({ stepNumber }: { stepNumber: number }) => {
        if (stepNumber === 0) return { toolChoice: 'required' as const }
        return undefined
      },
      modelSettings: {
        // 2k is enough for chat answers; 4k+ inflates the billing reservation
        // even when the actual response is short, eating into low-tier
        // input-token rate limits on Anthropic.
        maxOutputTokens: 2048,
        temperature: 0,
      },
    },
  })
}
