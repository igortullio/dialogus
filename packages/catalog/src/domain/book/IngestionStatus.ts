export const INGESTION_STATUS_VALUES = [
  'discovered',
  'downloading',
  'parsing',
  'chunking',
  'embedding',
  'ready',
  'failed',
] as const

export type IngestionStatus = (typeof INGESTION_STATUS_VALUES)[number]
