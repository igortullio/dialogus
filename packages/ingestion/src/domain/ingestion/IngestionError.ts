import { DialogusError } from '@dialogus/shared/errors'

export interface IngestionErrorOptions {
  readonly cause?: unknown
  readonly retryable?: boolean
}

abstract class IngestionStageError extends DialogusError {
  readonly retryable: boolean

  protected constructor(
    code: string,
    message: string,
    retryableDefault: boolean,
    options?: IngestionErrorOptions,
  ) {
    super(code, message, options?.cause)
    this.retryable = options?.retryable ?? retryableDefault
  }
}

export class DownloadError extends IngestionStageError {
  constructor(message: string, options?: IngestionErrorOptions) {
    super('INGESTION_DOWNLOAD_FAILED', message, true, options)
  }
}

export class CleanError extends IngestionStageError {
  constructor(message: string, options?: IngestionErrorOptions) {
    super('INGESTION_CLEAN_FAILED', message, false, options)
  }
}

export class ParseError extends IngestionStageError {
  constructor(message: string, options?: IngestionErrorOptions) {
    super('INGESTION_PARSE_FAILED', message, false, options)
  }
}

export class ChunkError extends IngestionStageError {
  constructor(message: string, options?: IngestionErrorOptions) {
    super('INGESTION_CHUNK_FAILED', message, false, options)
  }
}

export class EmbedError extends IngestionStageError {
  constructor(message: string, options?: IngestionErrorOptions) {
    super('INGESTION_EMBED_FAILED', message, true, options)
  }
}

export class IndexError extends IngestionStageError {
  constructor(message: string, options?: IngestionErrorOptions) {
    super('INGESTION_INDEX_FAILED', message, false, options)
  }
}
