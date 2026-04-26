import { BookNotFoundError } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { books } from '@dialogus/db/schema'
import type { IngestionStatusDto } from '@dialogus/shared/schemas/ingestion'
import { eq } from 'drizzle-orm'
import { isIngestionStage, parseIngestionErrorField, statusToActiveStage } from './ingestionStatus'

export interface GetIngestionStatusDeps {
  readonly db: Database
}

export async function getIngestionStatus(
  deps: GetIngestionStatusDeps,
  bookId: string,
): Promise<IngestionStatusDto> {
  const row = await deps.db.query.books.findFirst({
    where: eq(books.id, bookId),
    columns: {
      id: true,
      ingestionStatus: true,
      ingestionProgress: true,
      ingestionError: true,
      ingestionLastStage: true,
      ingestionStartedAt: true,
      indexedAt: true,
    },
  })
  if (!row) throw new BookNotFoundError(`Book ${bookId} not found`)

  const activeStage = statusToActiveStage(row.ingestionStatus)
  const lastStage = row.ingestionLastStage
  const stage =
    row.ingestionStatus === 'failed' && lastStage !== null && isIngestionStage(lastStage)
      ? lastStage
      : activeStage

  return {
    book_id: row.id,
    status: row.ingestionStatus,
    stage,
    progress: row.ingestionProgress,
    started_at: row.ingestionStartedAt ? row.ingestionStartedAt.toISOString() : null,
    indexed_at: row.indexedAt ? row.indexedAt.toISOString() : null,
    last_stage: lastStage,
    error: parseIngestionErrorField(row.ingestionError),
  }
}
