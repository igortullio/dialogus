import { anthropic } from '@ai-sdk/anthropic'
import { Agent } from '@mastra/core/agent'
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

export type DialogusAgentModelId = 'claude-haiku-4-5' | 'claude-sonnet-4-6'

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
  readonly modelId: DialogusAgentModelId
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
    model: anthropic(deps.modelId),
    tools,
    memory: new Memory(),
  })
}
