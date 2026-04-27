import { DialogusError } from '@dialogus/shared/errors'

export interface RagErrorOptions {
  readonly cause?: unknown
}

export class SummaryNotFoundError extends DialogusError {
  constructor(message: string, options?: RagErrorOptions) {
    super('RAG_SUMMARY_NOT_FOUND', message, options?.cause)
  }
}

export class EmbeddingFailedError extends DialogusError {
  constructor(message: string, options?: RagErrorOptions) {
    super('RAG_EMBEDDING_FAILED', message, options?.cause)
  }
}
