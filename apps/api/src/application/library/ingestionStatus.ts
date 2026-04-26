import {
  INGESTION_STAGE_VALUES,
  type IngestionStage,
  type IngestionStatus,
} from '@dialogus/shared/schemas/ingestion'

const STATUS_TO_STAGE: Record<IngestionStatus, IngestionStage | null> = {
  discovered: null,
  downloading: 'download',
  cleaning: 'clean',
  parsing: 'parse',
  chunking: 'chunk',
  summarizing: 'summarize',
  embedding: 'embed',
  indexing: 'index',
  ready: null,
  failed: null,
}

const RETRYABLE_SLUGS: ReadonlySet<string> = new Set([
  'ingestion-download-failed',
  'ingestion-embed-failed',
  'ingestion-summarize-failed',
])

export function statusToActiveStage(status: IngestionStatus): IngestionStage | null {
  return STATUS_TO_STAGE[status]
}

export function isIngestionStage(value: string): value is IngestionStage {
  return (INGESTION_STAGE_VALUES as readonly string[]).includes(value)
}

export interface ParsedIngestionError {
  readonly slug: string
  readonly message: string
  readonly retryable: boolean
}

export function parseIngestionErrorField(raw: string | null): ParsedIngestionError | null {
  if (raw === null) return null
  const idx = raw.indexOf(': ')
  if (idx <= 0) {
    return { slug: 'ingestion-failed', message: raw, retryable: false }
  }
  const slug = raw.slice(0, idx)
  const message = raw.slice(idx + 2)
  return { slug, message, retryable: RETRYABLE_SLUGS.has(slug) }
}
