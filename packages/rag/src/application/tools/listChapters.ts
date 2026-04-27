import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { ChapterView } from '../../domain/entities/ChapterView'
import type { ChapterReadRepository } from '../../domain/ports/ChapterReadRepository.port'

export const LIST_CHAPTERS_TOOL_ID = 'list_chapters'
export const LIST_CHAPTERS_TOOL_DESCRIPTION =
  'List chapters (ordinal + title + token_count) for a book. Use for navigation, reformulation hints, or chapter-range questions.'

export const listChaptersInputSchema = z.object({
  book_id: z.uuid(),
})

export const chapterListItemSchema = z.object({
  chapter_id: z.string(),
  ordinal: z.number().int(),
  title: z.string(),
  token_count: z.number().int(),
})

export const listChaptersOutputSchema = z.object({
  chapters: z.array(chapterListItemSchema),
})

export type ListChaptersInput = z.infer<typeof listChaptersInputSchema>
export type ListChaptersOutput = z.infer<typeof listChaptersOutputSchema>
export type ListChaptersItem = z.infer<typeof chapterListItemSchema>

export interface ListChaptersLogger {
  info(meta: Record<string, unknown>, msg: string): void
  error(meta: Record<string, unknown>, msg: string): void
}

export interface ListChaptersToolDeps {
  readonly chapterRepo: ChapterReadRepository
  readonly logger: ListChaptersLogger
}

export function listChaptersTool(deps: ListChaptersToolDeps) {
  return createTool({
    id: LIST_CHAPTERS_TOOL_ID,
    description: LIST_CHAPTERS_TOOL_DESCRIPTION,
    inputSchema: listChaptersInputSchema,
    outputSchema: listChaptersOutputSchema,
    execute: async (input, context): Promise<ListChaptersOutput> => {
      const startedAt = performance.now()
      const threadId = context?.agent?.threadId
      const bookId = input.book_id

      try {
        const results = await deps.chapterRepo.listByBook(bookId)
        const chapters = [...results].sort((a, b) => a.ordinal - b.ordinal).map(toChapterListItem)
        deps.logger.info(
          {
            event: 'tool_call',
            tool: LIST_CHAPTERS_TOOL_ID,
            ...(threadId !== undefined ? { thread_id: threadId } : {}),
            book_id: bookId,
            chapter_count: chapters.length,
            duration_ms: durationMs(startedAt),
          },
          'tool_call',
        )
        return { chapters }
      } catch (error) {
        deps.logger.error(
          {
            event: 'tool_call',
            tool: LIST_CHAPTERS_TOOL_ID,
            ...(threadId !== undefined ? { thread_id: threadId } : {}),
            book_id: bookId,
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

function toChapterListItem(chapter: ChapterView): ListChaptersItem {
  return {
    chapter_id: chapter.id,
    ordinal: chapter.ordinal,
    title: chapter.title,
    token_count: chapter.tokenCount,
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
