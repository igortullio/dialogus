import {
  type IngestionStatus,
  type IngestionStatusDto,
  ingestionEnqueueResponseDtoSchema,
  ingestionStatusDtoSchema,
} from '@dialogus/shared/schemas/ingestion'
import { apiBaseUrl, fetchEnvelope, fetchVoid, nextCursorFromLinks } from './_envelope'
import { type Book, bookListSchema, bookSchema } from './_schemas'

const LIBRARY_BASE = '/api/library'

export interface FetchLibraryOptions {
  readonly cursor?: string
  readonly limit?: number
  readonly status?: IngestionStatus
  readonly language?: string
  readonly includeDeleted?: boolean
}

export interface FetchLibraryResult {
  readonly books: Book[]
  readonly nextCursor: string | null
}

export async function fetchLibrary(opts: FetchLibraryOptions = {}): Promise<FetchLibraryResult> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${LIBRARY_BASE}/books`, {
    schema: bookListSchema,
    where: 'fetchLibrary',
    query: {
      cursor: opts.cursor,
      limit: opts.limit,
      status: opts.status,
      language: opts.language,
      include_deleted: opts.includeDeleted,
    },
  })
  return { books: envelope.data, nextCursor: nextCursorFromLinks(envelope.links) }
}

export async function fetchBookById(id: string): Promise<Book> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${LIBRARY_BASE}/books/${id}`, {
    schema: bookSchema,
    where: 'fetchBookById',
  })
  return envelope.data
}

export async function addBook(gutendexId: number, idempotencyKey: string): Promise<Book> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${LIBRARY_BASE}/books`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { gutendex_id: gutendexId },
    schema: bookSchema,
    where: 'addBook',
  })
  return envelope.data
}

export async function removeBook(id: string): Promise<void> {
  await fetchVoid(apiBaseUrl(), `${LIBRARY_BASE}/books/${id}`, {
    method: 'DELETE',
    where: 'removeBook',
  })
}

export async function restoreBook(id: string): Promise<Book> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${LIBRARY_BASE}/books/${id}/restore`, {
    method: 'POST',
    schema: bookSchema,
    where: 'restoreBook',
  })
  return envelope.data
}

export interface StartIngestionResult {
  readonly jobId: string
}

export async function startIngestion(
  id: string,
  idempotencyKey: string,
): Promise<StartIngestionResult> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${LIBRARY_BASE}/books/${id}/ingest`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    schema: ingestionEnqueueResponseDtoSchema,
    where: 'startIngestion',
  })
  return { jobId: envelope.data.job_id }
}

export async function fetchIngestionStatus(id: string): Promise<IngestionStatusDto> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${LIBRARY_BASE}/books/${id}/ingestion`, {
    schema: ingestionStatusDtoSchema,
    where: 'fetchIngestionStatus',
  })
  return envelope.data
}

export interface RetryIngestionResult {
  readonly jobId: string
  readonly resumingStage: string
}

export async function retryIngestion(
  id: string,
  idempotencyKey: string,
): Promise<RetryIngestionResult> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${LIBRARY_BASE}/books/${id}/ingest/retry`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    schema: ingestionEnqueueResponseDtoSchema,
    where: 'retryIngestion',
  })
  return {
    jobId: envelope.data.job_id,
    resumingStage: envelope.data.stage ?? 'download',
  }
}
