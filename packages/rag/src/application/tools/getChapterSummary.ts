import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { ChapterSummaryView } from '../../domain/entities/ChapterSummaryView'
import { SummaryNotFoundError } from '../../domain/errors/RagError'
import type { ChapterSummaryReadRepository } from '../../domain/ports/ChapterSummaryReadRepository.port'

export const GET_CHAPTER_SUMMARY_TOOL_ID = 'get_chapter_summary'
export const GET_CHAPTER_SUMMARY_TOOL_DESCRIPTION = 'Return a pre-generated summary for a chapter.'

export const getChapterSummaryInputSchema = z.object({
  chapter_id: z.uuid(),
})

export const chapterSummaryDtoSchema = z.object({
  summary: z.string(),
  chapter_id: z.string(),
  chapter_ordinal: z.number().int(),
  chapter_title: z.string(),
  book_id: z.string(),
  token_count: z.number().int(),
  model: z.string(),
  generated_at: z.string(),
})

export const getChapterSummaryOutputSchema = chapterSummaryDtoSchema

export type GetChapterSummaryInput = z.infer<typeof getChapterSummaryInputSchema>
export type GetChapterSummaryOutput = z.infer<typeof getChapterSummaryOutputSchema>

export interface GetChapterSummaryLogger {
  info(meta: Record<string, unknown>, msg: string): void
  error(meta: Record<string, unknown>, msg: string): void
}

export interface GetChapterSummaryToolDeps {
  readonly chapterSummaryRepo: ChapterSummaryReadRepository
  readonly logger: GetChapterSummaryLogger
}

export function getChapterSummaryTool(deps: GetChapterSummaryToolDeps) {
  return createTool({
    id: GET_CHAPTER_SUMMARY_TOOL_ID,
    description: GET_CHAPTER_SUMMARY_TOOL_DESCRIPTION,
    inputSchema: getChapterSummaryInputSchema,
    outputSchema: getChapterSummaryOutputSchema,
    execute: async (input, context): Promise<GetChapterSummaryOutput> => {
      const startedAt = performance.now()
      const threadId = context?.agent?.threadId
      const chapterId = input.chapter_id

      try {
        const result = await deps.chapterSummaryRepo.findByChapterId(chapterId)
        if (!result) {
          throw new SummaryNotFoundError(`No chapter summary found for chapter_id=${chapterId}`)
        }
        const dto = toChapterSummaryDto(result)
        deps.logger.info(
          {
            event: 'tool_call',
            tool: GET_CHAPTER_SUMMARY_TOOL_ID,
            ...(threadId !== undefined ? { thread_id: threadId } : {}),
            chapter_id: chapterId,
            hit: true,
            duration_ms: durationMs(startedAt),
          },
          'tool_call',
        )
        return dto
      } catch (error) {
        deps.logger.error(
          {
            event: 'tool_call',
            tool: GET_CHAPTER_SUMMARY_TOOL_ID,
            ...(threadId !== undefined ? { thread_id: threadId } : {}),
            chapter_id: chapterId,
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

function toChapterSummaryDto(view: ChapterSummaryView): GetChapterSummaryOutput {
  return {
    summary: view.summary,
    chapter_id: view.chapterId,
    chapter_ordinal: view.chapterOrdinal,
    chapter_title: view.chapterTitle,
    book_id: view.bookId,
    token_count: view.tokenCount,
    model: view.model,
    generated_at: view.generatedAt.toISOString(),
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
