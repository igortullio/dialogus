import { z } from 'zod'

export const INGESTION_STATUS_VALUES = [
  'discovered',
  'downloading',
  'cleaning',
  'parsing',
  'chunking',
  'summarizing',
  'embedding',
  'indexing',
  'ready',
  'failed',
] as const

export const ingestionStatusEnum = z.enum(INGESTION_STATUS_VALUES)
export type IngestionStatus = z.infer<typeof ingestionStatusEnum>

export const INGESTION_STAGE_VALUES = [
  'download',
  'clean',
  'parse',
  'chunk',
  'summarize',
  'embed',
  'index',
] as const

export const ingestionStageEnum = z.enum(INGESTION_STAGE_VALUES)
export type IngestionStage = z.infer<typeof ingestionStageEnum>

/** Ordered pipeline stages — single source of truth for "stage N of 7". */
export const INGESTION_STAGE_ORDER = INGESTION_STAGE_VALUES
export const TOTAL_INGESTION_STAGES = INGESTION_STAGE_VALUES.length

export const INGESTION_STAGE_STATE_VALUES = [
  'pending',
  'queued',
  'running',
  'done',
  'failed',
  'skipped',
] as const

export const ingestionStageStateEnum = z.enum(INGESTION_STAGE_STATE_VALUES)
export type IngestionStageState = z.infer<typeof ingestionStageStateEnum>

export const ingestionUnitEnum = z.enum(['bytes', 'chapters', 'chunks'])
export type IngestionUnit = z.infer<typeof ingestionUnitEnum>

/**
 * Per-stage progress record. One per known stage; persisted as an element of
 * `books.ingestion_stages` (jsonb) and surfaced verbatim in the status DTO, so
 * the field names are snake_case to match the wire/DTO shape.
 */
export const ingestionStageProgressSchema = z.object({
  stage: ingestionStageEnum,
  state: ingestionStageStateEnum,
  units_done: z.number().int().nonnegative().nullable(),
  units_total: z.number().int().nonnegative().nullable(),
  unit: ingestionUnitEnum.nullable(),
  started_at: z.iso.datetime({ offset: true }).nullable(),
  ended_at: z.iso.datetime({ offset: true }).nullable(),
  attempt: z.number().int().positive(),
  cached: z.boolean(),
})
export type IngestionStageProgress = z.infer<typeof ingestionStageProgressSchema>

export const ingestionErrorDtoSchema = z.object({
  message: z.string().min(1),
  retryable: z.boolean(),
  slug: z.string().min(1),
  // Failing stage (when derivable from the persisted last stage). Added by
  // feature 002 so the UI can name the stage in plain language.
  stage: ingestionStageEnum.nullable(),
})
export type IngestionErrorDto = z.infer<typeof ingestionErrorDtoSchema>

export const ingestionStatusDtoSchema = z.object({
  book_id: z.uuid(),
  status: ingestionStatusEnum,
  stage: ingestionStageEnum.nullable(),
  /** Current-stage percent (0–100). */
  progress: z.number().int().min(0).max(100),
  started_at: z.iso.datetime({ offset: true }).nullable(),
  indexed_at: z.iso.datetime({ offset: true }).nullable(),
  last_stage: z.string().nullable(),
  error: ingestionErrorDtoSchema.nullable(),

  // --- feature 002: whole-pipeline framing (all derived, additive) ---
  /** Progress across the entire 7-stage pipeline (0–100). */
  overall_progress: z.number().int().min(0).max(100),
  /** 0-based index of the current stage in the canonical order. */
  stage_index: z.number().int().min(0),
  total_stages: z.number().int().positive(),
  /** Ordered breakdown, always length `total_stages`. */
  stages: z.array(ingestionStageProgressSchema),
  /** Elapsed since ingestion started, in ms (null before it starts). */
  elapsed_ms: z.number().int().nonnegative().nullable(),
  /** Best-effort remaining estimate, in ms; null when not reliably estimable. */
  eta_ms: z.number().int().nonnegative().nullable(),
  /** True when the current stage is queued but the worker has not started it. */
  queued: z.boolean(),
  /** True when non-terminal and the row has not advanced past the stall window. */
  stalled: z.boolean(),
})
export type IngestionStatusDto = z.infer<typeof ingestionStatusDtoSchema>

export const chunkReadDtoSchema = z.object({
  id: z.uuid(),
  book_id: z.uuid(),
  chapter_id: z.uuid(),
  chapter_title: z.string(),
  chapter_ordinal: z.number().int().nonnegative(),
  ordinal: z.number().int().nonnegative(),
  text: z.string(),
  token_count: z.number().int().nonnegative(),
  start_char: z.number().int().nonnegative(),
  end_char: z.number().int().nonnegative(),
})
export type ChunkReadDto = z.infer<typeof chunkReadDtoSchema>

export const ingestionEnqueueResponseDtoSchema = z.object({
  book_id: z.uuid(),
  status: ingestionStatusEnum,
  stage: ingestionStageEnum.nullable(),
  job_id: z.string().min(1),
})
export type IngestionEnqueueResponseDto = z.infer<typeof ingestionEnqueueResponseDtoSchema>
