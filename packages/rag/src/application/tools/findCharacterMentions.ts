import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { ChunkWithContext } from '../../domain/entities/ChunkWithContext'
import type { ChunkReadRepository } from '../../domain/ports/ChunkReadRepository.port'
import { chunkWithContextSchema } from './semanticSearch'

export const FIND_CHARACTER_MENTIONS_TOOL_ID = 'find_character_mentions'
export const FIND_CHARACTER_MENTIONS_TOOL_DESCRIPTION =
  "Find substring mentions of a character name (or its aliases) across one or more books. Returns earliest chapters first. Use for navigation questions like 'when does X first appear?'."
export const FIND_CHARACTER_MENTIONS_DEFAULT_LIMIT = 20
export const FIND_CHARACTER_MENTIONS_MAX_LIMIT = 50

export const findCharacterMentionsInputSchema = z.object({
  book_ids: z.array(z.uuid()).min(1),
  aliases: z.array(z.string().min(1)).min(1),
  spoiler_caps: z.record(z.uuid(), z.number().int().min(0)).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(FIND_CHARACTER_MENTIONS_MAX_LIMIT)
    .default(FIND_CHARACTER_MENTIONS_DEFAULT_LIMIT),
})

export const findCharacterMentionsOutputSchema = z.object({
  mentions: z.array(chunkWithContextSchema),
})

export type FindCharacterMentionsInput = z.infer<typeof findCharacterMentionsInputSchema>
export type FindCharacterMentionsOutput = z.infer<typeof findCharacterMentionsOutputSchema>
export type FindCharacterMentionsItem = z.infer<typeof chunkWithContextSchema>

export interface FindCharacterMentionsLogger {
  info(meta: Record<string, unknown>, msg: string): void
  error(meta: Record<string, unknown>, msg: string): void
}

export interface FindCharacterMentionsToolDeps {
  readonly chunkRepo: ChunkReadRepository
  readonly logger: FindCharacterMentionsLogger
}

export function findCharacterMentionsTool(deps: FindCharacterMentionsToolDeps) {
  return createTool({
    id: FIND_CHARACTER_MENTIONS_TOOL_ID,
    description: FIND_CHARACTER_MENTIONS_TOOL_DESCRIPTION,
    inputSchema: findCharacterMentionsInputSchema,
    outputSchema: findCharacterMentionsOutputSchema,
    execute: async (input, context): Promise<FindCharacterMentionsOutput> => {
      const startedAt = performance.now()
      const threadId = context?.agent?.threadId
      const bookIds = [...input.book_ids]
      const aliases = [...input.aliases]
      const spoilerCaps = input.spoiler_caps
      const limit = input.limit ?? FIND_CHARACTER_MENTIONS_DEFAULT_LIMIT

      try {
        const results = await deps.chunkRepo.findCharacterMentions({
          bookIds,
          aliases,
          spoilerCaps,
          limit,
        })
        const mentions = results.map(toMentionDto)
        deps.logger.info(
          {
            event: 'tool_call',
            tool: FIND_CHARACTER_MENTIONS_TOOL_ID,
            ...(threadId !== undefined ? { thread_id: threadId } : {}),
            book_ids: bookIds,
            alias_count: aliases.length,
            returned_count: mentions.length,
            duration_ms: durationMs(startedAt),
          },
          'tool_call',
        )
        return { mentions }
      } catch (error) {
        deps.logger.error(
          {
            event: 'tool_call',
            tool: FIND_CHARACTER_MENTIONS_TOOL_ID,
            ...(threadId !== undefined ? { thread_id: threadId } : {}),
            book_ids: bookIds,
            alias_count: aliases.length,
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

function toMentionDto(chunk: ChunkWithContext): FindCharacterMentionsItem {
  return {
    chunk_id: chunk.chunkId,
    book_id: chunk.bookId,
    chapter_id: chunk.chapterId,
    chapter_ordinal: chunk.chapterOrdinal,
    chapter_title: chunk.chapterTitle,
    text: chunk.text,
    score: chunk.score,
    excerpt_preview: chunk.excerptPreview,
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
