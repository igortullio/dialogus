import { DialogusError } from '@dialogus/shared/errors'

export class BookNotInDiscoveredStateError extends DialogusError {
  constructor(bookId: string, currentStatus: string) {
    super(
      'BOOK_NOT_IN_DISCOVERED_STATE',
      `Book ${bookId} is in '${currentStatus}', expected 'discovered'`,
    )
  }
}

export class BookNotInRetryableStateError extends DialogusError {
  constructor(bookId: string, currentStatus: string) {
    super(
      'BOOK_NOT_IN_RETRYABLE_STATE',
      `Book ${bookId} is in '${currentStatus}', expected 'failed'`,
    )
  }
}

export class BookAlreadyReadyError extends DialogusError {
  constructor(bookId: string) {
    super('BOOK_ALREADY_READY', `Book ${bookId} is already 'ready'`)
  }
}

export class ChunkNotFoundError extends DialogusError {
  constructor(chunkId: string) {
    super('CHUNK_NOT_FOUND', `Chunk ${chunkId} not found`)
  }
}

export class IngestionConcurrencyLimitError extends DialogusError {
  readonly limit: number
  constructor(limit: number) {
    super(
      'INGESTION_CONCURRENCY_LIMIT',
      `Too many concurrent ingestions in progress (limit ${limit}); try again once one finishes`,
    )
    this.limit = limit
  }
}
