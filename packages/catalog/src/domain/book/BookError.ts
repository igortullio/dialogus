import { DialogusError } from '@dialogus/shared/errors'

export class DuplicateBookError extends DialogusError {
  readonly existingBookId: string | null

  constructor(message: string, opts?: { existingBookId?: string; cause?: unknown }) {
    super('DUPLICATE_GUTENDEX_ID', message, opts?.cause)
    this.existingBookId = opts?.existingBookId ?? null
  }
}

export class BookNotFoundError extends DialogusError {
  constructor(message: string, cause?: unknown) {
    super('BOOK_NOT_FOUND', message, cause)
  }
}

export class GutendexUpstreamError extends DialogusError {
  readonly upstreamStatus: number | null

  constructor(upstreamStatus: number | null, message: string, cause?: unknown) {
    super('GUTENDEX_UPSTREAM_ERROR', message, cause)
    this.upstreamStatus = upstreamStatus
  }
}
