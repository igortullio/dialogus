import type { Database } from '@dialogus/db/client'
import type { PgBoss } from '@dialogus/db/pgboss'
import { books, type IngestionStageProgress, type IngestionStatus } from '@dialogus/db/schema'
import {
  INGESTION_STAGE_ORDER,
  type IngestionStage,
  type IngestionUnit,
} from '@dialogus/shared/schemas/ingestion'
import { eq, sql } from 'drizzle-orm'
import type { ChapterRepository } from '../../domain/chapter/ChapterRepository.port'
import type { ChunkRepository } from '../../domain/chunk/ChunkRepository.port'
import type { EmbeddingProvider } from '../../domain/embedding/EmbeddingProvider.port'
import type { ChapterParser } from '../../domain/parser/ChapterParser.port'
import type { GutendexDownloader } from '../../infrastructure/external/GutendexDownloader'

export interface StagePayload {
  readonly bookId: string
}

export interface StageLogger {
  info(meta: Record<string, unknown>, msg: string): void
  warn(meta: Record<string, unknown>, msg: string): void
  error(meta: Record<string, unknown>, msg: string): void
}

export interface StageDeps {
  readonly db: Database
  readonly logger: StageLogger
  readonly chapterRepo: ChapterRepository
  readonly chunkRepo: ChunkRepository
  readonly embeddingProvider: EmbeddingProvider
  readonly chapterParser: ChapterParser
  readonly txtChapterParser: ChapterParser
  readonly downloader: GutendexDownloader
  readonly pgboss: PgBoss
  readonly storageRoot?: string
  readonly downloadHeartbeatMs?: number
}

export type StageHandler = (payload: StagePayload, deps: StageDeps) => Promise<void>

export const DEFAULT_STORAGE_ROOT = './storage'

export const INGESTION_QUEUES = {
  download: 'ingestion.download',
  clean: 'ingestion.clean',
  parse: 'ingestion.parse',
  chunk: 'ingestion.chunk',
  summarize: 'ingestion.summarize',
  embed: 'ingestion.embed',
  index: 'ingestion.index',
} as const

export type IngestionQueue = (typeof INGESTION_QUEUES)[keyof typeof INGESTION_QUEUES]

export const INGESTION_ERROR_SLUGS = {
  download: 'ingestion-download-failed',
  clean: 'ingestion-clean-failed',
  parse: 'ingestion-parse-failed',
  chunk: 'ingestion-chunk-failed',
  summarize: 'ingestion-summarize-failed',
  embed: 'ingestion-embed-failed',
  index: 'ingestion-index-failed',
} as const

export type IngestionErrorSlug = (typeof INGESTION_ERROR_SLUGS)[keyof typeof INGESTION_ERROR_SLUGS]

export interface BookRecordForStage {
  readonly id: string
  readonly gutendexId: number
  readonly languages: readonly string[]
  readonly ingestionStatus: IngestionStatus
  readonly ingestionLastStage: string | null
  readonly ingestionStartedAt: Date | null
  readonly rawHash: string | null
  readonly downloadUrlEpub: string | null
  readonly downloadUrlTxt: string | null
}

export class BookNotFoundForStageError extends Error {
  constructor(public readonly bookId: string) {
    super(`Book ${bookId} not found`)
    this.name = 'BookNotFoundForStageError'
  }
}

export async function findBookForStage(db: Database, bookId: string): Promise<BookRecordForStage> {
  const row = await db.query.books.findFirst({
    where: eq(books.id, bookId),
    columns: {
      id: true,
      gutendexId: true,
      languages: true,
      ingestionStatus: true,
      ingestionLastStage: true,
      ingestionStartedAt: true,
      rawHash: true,
      downloadUrlEpub: true,
      downloadUrlTxt: true,
    },
  })
  if (!row) throw new BookNotFoundForStageError(bookId)
  return row
}

export interface BookStateUpdate {
  readonly ingestionStatus?: IngestionStatus
  readonly ingestionProgress?: number
  readonly ingestionLastStage?: string | null
  readonly ingestionError?: string | null
  readonly ingestionStages?: IngestionStageProgress[]
  readonly rawHash?: string | null
  readonly indexedAt?: Date | null
  readonly markStartedAtIfNull?: boolean
}

export async function updateBookState(
  db: Database,
  bookId: string,
  update: BookStateUpdate,
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: sql`now()` }
  if (update.ingestionStatus !== undefined) set.ingestionStatus = update.ingestionStatus
  if (update.ingestionProgress !== undefined) set.ingestionProgress = update.ingestionProgress
  if (update.ingestionLastStage !== undefined) set.ingestionLastStage = update.ingestionLastStage
  if (update.ingestionError !== undefined) set.ingestionError = update.ingestionError
  if (update.ingestionStages !== undefined) set.ingestionStages = update.ingestionStages
  if (update.rawHash !== undefined) set.rawHash = update.rawHash
  if (update.indexedAt !== undefined) set.indexedAt = update.indexedAt
  if (update.markStartedAtIfNull === true) {
    set.ingestionStartedAt = sql`COALESCE(${books.ingestionStartedAt}, now())`
  }
  await db.update(books).set(set).where(eq(books.id, bookId))
}

// ---------------------------------------------------------------------------
// Per-stage progress records (feature 002-ingestion-progress-tracking).
//
// One record per stage lives in `books.ingestion_stages` (jsonb). The pipeline
// is strictly sequential per book, so these read-modify-write helpers never race
// on the same row. The denormalized snapshot columns (status / progress /
// last_stage / error) are kept in sync in the same UPDATE so the cheap library
// list stays correct.
// ---------------------------------------------------------------------------

export const STAGE_TO_RUNNING_STATUS: Record<IngestionStage, IngestionStatus> = {
  download: 'downloading',
  clean: 'cleaning',
  parse: 'parsing',
  chunk: 'chunking',
  summarize: 'summarizing',
  embed: 'embedding',
  index: 'indexing',
}

function emptyStageRecord(stage: IngestionStage): IngestionStageProgress {
  return {
    stage,
    state: 'pending',
    units_done: null,
    units_total: null,
    unit: null,
    started_at: null,
    ended_at: null,
    attempt: 1,
    cached: false,
  }
}

/** Normalize to the canonical 7-length ordered array, preserving known records. */
function normalizeStages(
  raw: readonly IngestionStageProgress[] | null | undefined,
): IngestionStageProgress[] {
  const byStage = new Map((raw ?? []).map((record) => [record.stage, record]))
  return INGESTION_STAGE_ORDER.map((stage) => byStage.get(stage) ?? emptyStageRecord(stage))
}

async function readStages(db: Database, bookId: string): Promise<IngestionStageProgress[]> {
  const row = await db.query.books.findFirst({
    where: eq(books.id, bookId),
    columns: { ingestionStages: true },
  })
  return normalizeStages(row?.ingestionStages)
}

function patchStage(
  stages: readonly IngestionStageProgress[],
  stage: IngestionStage,
  patch: Partial<IngestionStageProgress>,
): IngestionStageProgress[] {
  return stages.map((record) => (record.stage === stage ? { ...record, ...patch } : record))
}

function nowIso(): string {
  return new Date().toISOString()
}

export interface BeginStageOptions {
  readonly unitsTotal?: number | null
  readonly unit?: IngestionUnit | null
  readonly markStartedAtIfNull?: boolean
}

/** Stage handler entry point: mark the stage running + reset the snapshot. */
export async function beginStage(
  db: Database,
  bookId: string,
  stage: IngestionStage,
  options: BeginStageOptions = {},
): Promise<void> {
  const stages = await readStages(db, bookId)
  const previous = stages.find((record) => record.stage === stage)
  // A pg-boss retry re-enters a still-"running" record → count it as a new attempt.
  const attempt = previous?.state === 'running' ? previous.attempt + 1 : (previous?.attempt ?? 1)
  const unit = options.unit ?? null
  const unitsTotal = options.unitsTotal ?? null
  const next = patchStage(stages, stage, {
    state: 'running',
    started_at: nowIso(),
    ended_at: null,
    units_done: unitsTotal === null && unit === null ? null : 0,
    units_total: unitsTotal,
    unit,
    attempt,
    cached: false,
  })
  await updateBookState(db, bookId, {
    ingestionStatus: STAGE_TO_RUNNING_STATUS[stage],
    ingestionProgress: 0,
    ingestionLastStage: stage,
    ingestionError: null,
    ingestionStages: next,
    ...(options.markStartedAtIfNull === true ? { markStartedAtIfNull: true } : {}),
  })
}

/** Update sub-progress (units + percent) of the currently-running stage. */
export async function reportStageUnits(
  db: Database,
  bookId: string,
  stage: IngestionStage,
  unitsDone: number,
  options: { unitsTotal?: number | null; unit?: IngestionUnit; progress?: number } = {},
): Promise<void> {
  const stages = await readStages(db, bookId)
  const previous = stages.find((record) => record.stage === stage)
  const unitsTotal = options.unitsTotal ?? previous?.units_total ?? null
  const percent =
    options.progress ??
    (unitsTotal && unitsTotal > 0 ? Math.min(99, Math.floor((unitsDone / unitsTotal) * 100)) : 0)
  const next = patchStage(stages, stage, {
    units_done: unitsDone,
    units_total: unitsTotal,
    ...(options.unit ? { unit: options.unit } : {}),
  })
  await updateBookState(db, bookId, { ingestionProgress: percent, ingestionStages: next })
}

/** Mark the stage finished successfully. `finalStatus`/`indexedAt` are for `index`. */
export async function completeStage(
  db: Database,
  bookId: string,
  stage: IngestionStage,
  options: { finalStatus?: IngestionStatus; indexedAt?: Date } = {},
): Promise<void> {
  const stages = await readStages(db, bookId)
  const previous = stages.find((record) => record.stage === stage)
  const next = patchStage(stages, stage, {
    state: 'done',
    ended_at: nowIso(),
    units_done: previous?.units_total ?? previous?.units_done ?? null,
  })
  await updateBookState(db, bookId, {
    ingestionProgress: 100,
    ingestionStages: next,
    ...(options.finalStatus ? { ingestionStatus: options.finalStatus } : {}),
    ...(options.indexedAt ? { indexedAt: options.indexedAt } : {}),
  })
}

/** Mark the stage skipped because its work was cached / already done. */
export async function skipStageCached(
  db: Database,
  bookId: string,
  stage: IngestionStage,
): Promise<void> {
  const stages = await readStages(db, bookId)
  const now = nowIso()
  const next = patchStage(stages, stage, {
    state: 'skipped',
    cached: true,
    started_at: now,
    ended_at: now,
  })
  await updateBookState(db, bookId, { ingestionProgress: 100, ingestionStages: next })
}

/** Mark the stage failed and write the snapshot error (`<slug>: <message>`). */
export async function failStage(
  db: Database,
  bookId: string,
  stage: IngestionStage,
  errorField: string,
): Promise<void> {
  const stages = await readStages(db, bookId)
  const next = patchStage(stages, stage, { state: 'failed', ended_at: nowIso() })
  await updateBookState(db, bookId, {
    ingestionStatus: 'failed',
    ingestionError: errorField,
    ingestionLastStage: stage,
    ingestionStages: next,
  })
}

/** Hand-off: mark the next stage queued (worker has not picked it up yet). */
export async function queueStage(
  db: Database,
  bookId: string,
  stage: IngestionStage,
): Promise<void> {
  const stages = await readStages(db, bookId)
  const next = patchStage(stages, stage, {
    state: 'queued',
    started_at: null,
    ended_at: null,
  })
  await updateBookState(db, bookId, { ingestionStages: next })
}

/** Retry reset: the resumed stage and everything after it return to pending. */
export function resetStagesFrom(
  stages: readonly IngestionStageProgress[],
  stage: IngestionStage,
): IngestionStageProgress[] {
  const fromIndex = INGESTION_STAGE_ORDER.indexOf(stage)
  return normalizeStages(stages).map((record) => {
    const recordIndex = INGESTION_STAGE_ORDER.indexOf(record.stage)
    return recordIndex >= fromIndex ? emptyStageRecord(record.stage) : record
  })
}

/**
 * Prefer plain TXT over EPUB for chaptering. Project Gutenberg TXT is the
 * canonical, predictable form: real chapters are flagged by `CHAPTER <n>`
 * headings (caught by the TXT heuristics) and the START/END license boilerplate
 * is stripped by `GutenbergCleaner`. The Gutenberg EPUBs, by contrast, surface
 * front-matter sections (title page, translator note, the *license itself*) as
 * "chapters" and group the real chapters coarsely — so EPUB is the fallback,
 * used only when no TXT is offered.
 */
export function preferredFormat(book: BookRecordForStage): 'epub' | 'txt' {
  if (book.downloadUrlTxt) return 'txt'
  if (book.downloadUrlEpub) return 'epub'
  return 'txt'
}

export function rawFilePath(
  storageRoot: string,
  gutendexId: number,
  format: 'epub' | 'txt',
): string {
  return `${storageRoot}/raw/${gutendexId}.${format}`
}

export function cleanFilePath(storageRoot: string, gutendexId: number): string {
  return `${storageRoot}/clean/${gutendexId}.txt`
}
