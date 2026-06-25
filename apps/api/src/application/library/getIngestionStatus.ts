import { BookNotFoundError, type LibraryEntryRepository } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { books } from '@dialogus/db/schema'
import type { IngestionStatusDto } from '@dialogus/shared/schemas/ingestion'
import { TOTAL_INGESTION_STAGES } from '@dialogus/shared/schemas/ingestion'
import { eq } from 'drizzle-orm'
import {
  computeOverallProgress,
  deriveErrorStage,
  deriveQueued,
  deriveStageBreakdown,
  deriveStageIndex,
  deriveStalled,
  estimateEta,
  isIngestionStage,
  parseIngestionErrorField,
  statusToActiveStage,
} from './ingestionStatus'

const DEFAULT_STALL_THRESHOLD_MS = 60_000

export interface GetIngestionStatusDeps {
  readonly db: Database
  readonly libraryRepo: LibraryEntryRepository
  /** Idle window before a non-terminal book reads as stalled (FR-016). */
  readonly stallThresholdMs?: number
}

export async function getIngestionStatus(
  deps: GetIngestionStatusDeps,
  userId: string,
  bookId: string,
): Promise<IngestionStatusDto> {
  // Don't reveal the status of un-added (or cross-user) titles (FR-007, SC-002).
  const isMember = await deps.libraryRepo.isActiveMember(userId, bookId)
  if (!isMember) throw new BookNotFoundError(`Book ${bookId} not found`)

  const row = await deps.db.query.books.findFirst({
    where: eq(books.id, bookId),
    columns: {
      id: true,
      ingestionStatus: true,
      ingestionProgress: true,
      ingestionError: true,
      ingestionLastStage: true,
      ingestionStages: true,
      ingestionStartedAt: true,
      indexedAt: true,
      updatedAt: true,
    },
  })
  if (!row) throw new BookNotFoundError(`Book ${bookId} not found`)

  const activeStage = statusToActiveStage(row.ingestionStatus)
  const lastStage = row.ingestionLastStage
  const stage =
    row.ingestionStatus === 'failed' && lastStage !== null && isIngestionStage(lastStage)
      ? lastStage
      : activeStage

  const now = Date.now()
  const stages = deriveStageBreakdown(row.ingestionStages, row.ingestionStatus, stage)
  const parsedError = parseIngestionErrorField(row.ingestionError)
  const errorStage = deriveErrorStage(row.ingestionStatus, lastStage)

  return {
    book_id: row.id,
    status: row.ingestionStatus,
    stage,
    progress: row.ingestionProgress,
    started_at: row.ingestionStartedAt ? row.ingestionStartedAt.toISOString() : null,
    indexed_at: row.indexedAt ? row.indexedAt.toISOString() : null,
    last_stage: lastStage,
    error: parsedError ? { ...parsedError, stage: errorStage } : null,
    overall_progress: computeOverallProgress(row.ingestionStatus, stage, row.ingestionProgress),
    stage_index: deriveStageIndex(stage, row.ingestionStatus),
    total_stages: TOTAL_INGESTION_STAGES,
    stages,
    elapsed_ms: row.ingestionStartedAt ? now - row.ingestionStartedAt.getTime() : null,
    eta_ms: estimateEta(stages, stage, now),
    queued: deriveQueued(stages, stage),
    stalled: deriveStalled(
      row.ingestionStatus,
      row.updatedAt,
      deps.stallThresholdMs ?? DEFAULT_STALL_THRESHOLD_MS,
      now,
    ),
  }
}
