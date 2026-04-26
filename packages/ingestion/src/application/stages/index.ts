import { sql } from 'drizzle-orm'
import { IndexError } from '../../domain/ingestion/IngestionError'
import {
  findBookForStage,
  INGESTION_ERROR_SLUGS,
  type StageDeps,
  type StagePayload,
  updateBookState,
} from './_common'

export type IndexStageDeps = Pick<StageDeps, 'db' | 'logger'>

export async function indexStage(payload: StagePayload, deps: IndexStageDeps): Promise<void> {
  const stageStartedAt = Date.now()
  const book = await findBookForStage(deps.db, payload.bookId)

  await updateBookState(deps.db, book.id, {
    ingestionStatus: 'indexing',
    ingestionProgress: 0,
    ingestionLastStage: 'index',
    ingestionError: null,
  })

  const indexedAt = new Date()

  try {
    await deps.db.execute(sql`VACUUM ANALYZE chunks`)
    await updateBookState(deps.db, book.id, {
      ingestionStatus: 'ready',
      ingestionProgress: 100,
      indexedAt,
    })
  } catch (error) {
    const wrapped =
      error instanceof IndexError
        ? error
        : new IndexError(`Index stage failed for book ${book.id}`, { cause: error })
    await updateBookState(deps.db, book.id, {
      ingestionStatus: 'failed',
      ingestionError: `${INGESTION_ERROR_SLUGS.index}: ${wrapped.message}`,
    })
    deps.logger.error(
      {
        event: 'stage_failed',
        stage: 'index',
        book_id: book.id,
        gutendex_id: book.gutendexId,
        error_slug: INGESTION_ERROR_SLUGS.index,
        error_message: wrapped.message,
        retryable: wrapped.retryable,
        duration_ms: Date.now() - stageStartedAt,
      },
      'ingestion stage failed',
    )
    throw wrapped
  }

  const totalDurationMs = book.ingestionStartedAt
    ? indexedAt.getTime() - book.ingestionStartedAt.getTime()
    : null

  deps.logger.info(
    {
      event: 'stage_completed',
      stage: 'index',
      book_id: book.id,
      gutendex_id: book.gutendexId,
      total_duration_ms: totalDurationMs,
      duration_ms: Date.now() - stageStartedAt,
    },
    'ingestion pipeline completed',
  )
}
