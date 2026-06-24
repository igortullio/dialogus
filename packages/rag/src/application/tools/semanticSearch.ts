import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { ChunkWithContext } from '../../domain/entities/ChunkWithContext'
import type { ChunkReadRepository } from '../../domain/ports/ChunkReadRepository.port'
import type { QueryEmbedder } from '../../domain/ports/QueryEmbedder.port'

export const SEMANTIC_SEARCH_TOOL_ID = 'semantic_search'
export const SEMANTIC_SEARCH_TOOL_DESCRIPTION =
  'Retrieve passages semantically similar to the query from selected books.'
// Default k=10 widens recall so the relevant passage is more likely included —
// k=5 too often returned only the chapters where a name first appears (e.g. a
// character's introduction) and missed later/climactic scenes. The trade-off is
// a larger per-call payload; the model can still opt up to MAX_K when needed.
export const SEMANTIC_SEARCH_DEFAULT_K = 10
export const SEMANTIC_SEARCH_MAX_K = 30
export const SEMANTIC_SEARCH_EXCERPT_PREVIEW_MAX_LENGTH = 200

export const semanticSearchInputSchema = z.object({
  query: z.string().min(1),
  book_ids: z.array(z.uuid()).min(1),
  spoiler_caps: z.record(z.uuid(), z.number().int().min(0)).optional(),
  k: z.number().int().min(1).max(SEMANTIC_SEARCH_MAX_K).default(SEMANTIC_SEARCH_DEFAULT_K),
})

export const chunkWithContextSchema = z.object({
  chunk_id: z.string(),
  book_id: z.string(),
  chapter_id: z.string(),
  chapter_ordinal: z.number().int(),
  chapter_title: z.string(),
  text: z.string(),
  score: z.number(),
  excerpt_preview: z.string(),
})

export const semanticSearchOutputSchema = z.object({
  chunks: z.array(chunkWithContextSchema),
})

export type SemanticSearchInput = z.infer<typeof semanticSearchInputSchema>
export type SemanticSearchOutput = z.infer<typeof semanticSearchOutputSchema>
export type SemanticSearchChunk = z.infer<typeof chunkWithContextSchema>

export interface SemanticSearchLogger {
  info(meta: Record<string, unknown>, msg: string): void
  error(meta: Record<string, unknown>, msg: string): void
}

export interface SemanticSearchToolDeps {
  readonly chunkRepo: ChunkReadRepository
  readonly queryEmbedder: QueryEmbedder
  readonly logger: SemanticSearchLogger
}

export function semanticSearchTool(deps: SemanticSearchToolDeps) {
  return createTool({
    id: SEMANTIC_SEARCH_TOOL_ID,
    description: SEMANTIC_SEARCH_TOOL_DESCRIPTION,
    inputSchema: semanticSearchInputSchema,
    outputSchema: semanticSearchOutputSchema,
    execute: async (input, context): Promise<SemanticSearchOutput> => {
      const startedAt = performance.now()
      const threadId = context?.agent?.threadId
      const bookIds = [...input.book_ids]
      const spoilerCaps = input.spoiler_caps
      const k = input.k ?? SEMANTIC_SEARCH_DEFAULT_K

      try {
        const queryEmbedding = await deps.queryEmbedder.embed(input.query)
        const results = await deps.chunkRepo.searchSemantic({
          bookIds,
          queryEmbedding,
          spoilerCaps,
          k,
        })
        const chunks = results.map(toSemanticSearchChunk)
        deps.logger.info(
          {
            event: 'tool_call',
            tool: SEMANTIC_SEARCH_TOOL_ID,
            ...(threadId !== undefined ? { thread_id: threadId } : {}),
            book_ids: bookIds,
            spoiler_caps_active: spoilerCaps !== undefined,
            k,
            returned_count: chunks.length,
            duration_ms: durationMs(startedAt),
          },
          'tool_call',
        )
        return { chunks }
      } catch (error) {
        deps.logger.error(
          {
            event: 'tool_call',
            tool: SEMANTIC_SEARCH_TOOL_ID,
            ...(threadId !== undefined ? { thread_id: threadId } : {}),
            book_ids: bookIds,
            spoiler_caps_active: spoilerCaps !== undefined,
            k,
            duration_ms: durationMs(startedAt),
            error: describeError(error),
          },
          'tool_call_failed',
        )
        throw error
      }
    },
  })
}

function toSemanticSearchChunk(chunk: ChunkWithContext): SemanticSearchChunk {
  return {
    chunk_id: chunk.chunkId,
    book_id: chunk.bookId,
    chapter_id: chunk.chapterId,
    chapter_ordinal: chunk.chapterOrdinal,
    chapter_title: chunk.chapterTitle,
    text: chunk.text,
    score: chunk.score,
    excerpt_preview: chunk.excerptPreview.slice(0, SEMANTIC_SEARCH_EXCERPT_PREVIEW_MAX_LENGTH),
  }
}

function durationMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt)
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
