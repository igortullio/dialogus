export const INGESTION_STATUS_VALUES = [
  'discovered',
  'downloading',
  'cleaning',
  'parsing',
  'chunking',
  'embedding',
  'indexing',
  'ready',
  'failed',
] as const

export type IngestionStatus = (typeof INGESTION_STATUS_VALUES)[number]
