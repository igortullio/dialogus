import { randomUUID } from 'node:crypto'
import type { Chapter } from '../../domain/chapter/Chapter'
import type { ChapterSummary } from '../../domain/chapter_summary/ChapterSummary'
import type { ChapterSummaryGenerator } from '../../domain/chapter_summary/ChapterSummaryGenerator.port'
import type { ChapterSummaryRepository } from '../../domain/chapter_summary/ChapterSummaryRepository.port'
import { SummarizeError } from '../../domain/ingestion/IngestionError'
import type { ParsedChapter, SupportedLanguage } from '../../domain/parser/ChapterParser.port'
import {
  type BookRecordForStage,
  beginStage,
  completeStage,
  failStage,
  findBookForStage,
  INGESTION_ERROR_SLUGS,
  INGESTION_QUEUES,
  queueStage,
  reportStageUnits,
  type StageDeps,
  type StagePayload,
} from './_common'

export type SummarizeStageDeps = Pick<StageDeps, 'db' | 'logger' | 'pgboss' | 'chapterRepo'> & {
  readonly chapterSummaryRepo: ChapterSummaryRepository
  readonly chapterSummaryGenerator: ChapterSummaryGenerator
}

export async function summarizeStage(
  payload: StagePayload,
  deps: SummarizeStageDeps,
): Promise<void> {
  const startedAt = Date.now()
  const book = await findBookForStage(deps.db, payload.bookId)

  const language = resolveLanguage(book)
  const totalChapters = await deps.chapterRepo.countByBookId(book.id)
  await beginStage(deps.db, book.id, 'summarize', { unit: 'chapters', unitsTotal: totalChapters })
  let generated = 0

  try {
    const missingChapterIds = await deps.chapterSummaryRepo.listMissingChapterIds(book.id)
    const existingCount = totalChapters - missingChapterIds.length
    if (existingCount > 0) {
      await reportStageUnits(deps.db, book.id, 'summarize', existingCount, {
        unitsTotal: totalChapters,
        unit: 'chapters',
      })
    }

    for (const [index, chapterId] of missingChapterIds.entries()) {
      const chapter = await deps.chapterRepo.findById(chapterId)
      if (!chapter) {
        throw new SummarizeError(`Chapter ${chapterId} not found while summarizing book ${book.id}`)
      }
      const result = await deps.chapterSummaryGenerator.generate(toParsedChapter(chapter), language)
      const summary: ChapterSummary = {
        id: randomUUID(),
        chapterId: chapter.id,
        bookId: book.id,
        summary: result.summary,
        tokenCount: result.tokenCount,
        model: result.model,
        generatedAt: new Date(),
      }
      await deps.chapterSummaryRepo.save(summary)
      generated += 1

      const completed = existingCount + index + 1
      const progress = totalChapters > 0 ? Math.floor((completed / totalChapters) * 100) : 100
      await reportStageUnits(deps.db, book.id, 'summarize', completed, {
        unitsTotal: totalChapters,
        unit: 'chapters',
        progress,
      })

      deps.logger.info(
        {
          event: 'summarize_chapter_persisted',
          stage: 'summarize',
          book_id: book.id,
          gutendex_id: book.gutendexId,
          chapter_id: chapter.id,
          chapter_ordinal: chapter.ordinal,
          progress,
        },
        'chapter summary persisted',
      )
    }
  } catch (error) {
    const wrapped =
      error instanceof SummarizeError
        ? error
        : new SummarizeError(`Summarize stage failed for book ${book.id}`, { cause: error })
    await failStage(
      deps.db,
      book.id,
      'summarize',
      `${INGESTION_ERROR_SLUGS.summarize}: ${wrapped.message}`,
    )
    deps.logger.error(
      {
        event: 'stage_failed',
        stage: 'summarize',
        book_id: book.id,
        gutendex_id: book.gutendexId,
        error_slug: INGESTION_ERROR_SLUGS.summarize,
        error_message: wrapped.message,
        retryable: wrapped.retryable,
        duration_ms: Date.now() - startedAt,
      },
      'ingestion stage failed',
    )
    return
  }

  await completeStage(deps.db, book.id, 'summarize')
  await queueStage(deps.db, book.id, 'embed')
  await deps.pgboss.send(INGESTION_QUEUES.embed, { bookId: book.id })

  deps.logger.info(
    {
      event: 'stage_completed',
      stage: 'summarize',
      book_id: book.id,
      gutendex_id: book.gutendexId,
      chapters_count: totalChapters,
      summaries_generated: generated,
      duration_ms: Date.now() - startedAt,
    },
    'ingestion stage completed',
  )
}

function resolveLanguage(book: BookRecordForStage): SupportedLanguage {
  const raw = book.languages[0]
  if (!raw) return 'en'
  const prefix = raw.trim().toLowerCase().slice(0, 2)
  return prefix === 'pt' ? 'pt' : 'en'
}

function toParsedChapter(chapter: Chapter): ParsedChapter {
  return {
    ordinal: chapter.ordinal,
    title: chapter.title,
    plainText: chapter.plainText,
    tokenCount: chapter.tokenCount,
  }
}
