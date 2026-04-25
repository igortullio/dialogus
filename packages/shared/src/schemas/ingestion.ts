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

export const ingestionErrorDtoSchema = z.object({
  message: z.string().min(1),
  retryable: z.boolean(),
  slug: z.string().min(1),
})
export type IngestionErrorDto = z.infer<typeof ingestionErrorDtoSchema>

export const ingestionStatusDtoSchema = z.object({
  book_id: z.uuid(),
  status: ingestionStatusEnum,
  stage: ingestionStageEnum.nullable(),
  progress: z.number().int().min(0).max(100),
  started_at: z.iso.datetime({ offset: true }).nullable(),
  indexed_at: z.iso.datetime({ offset: true }).nullable(),
  last_stage: z.string().nullable(),
  error: ingestionErrorDtoSchema.nullable(),
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
