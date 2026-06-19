import { BookNotFoundError } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { books } from '@dialogus/db/schema'
import type { IngestionEnqueueResponseDto } from '@dialogus/shared/schemas/ingestion'
import { eq } from 'drizzle-orm'
import { type EnqueueDeps, enqueue } from '../../infrastructure/pgboss/enqueue'
import { BookNotInDiscoveredStateError } from './errors'

export interface IngestBookDeps {
  readonly db: Database
  readonly enqueueDeps: EnqueueDeps
  readonly enqueueImpl?: typeof enqueue
}

export async function ingestBook(
  deps: IngestBookDeps,
  bookId: string,
): Promise<IngestionEnqueueResponseDto> {
  const row = await deps.db.query.books.findFirst({
    where: eq(books.id, bookId),
    columns: { id: true, ingestionStatus: true },
  })
  if (!row) throw new BookNotFoundError(`Book ${bookId} not found`)
  if (row.ingestionStatus !== 'discovered') {
    throw new BookNotInDiscoveredStateError(bookId, row.ingestionStatus)
  }

  const enqueueFn = deps.enqueueImpl ?? enqueue
  const jobId = await enqueueFn(deps.enqueueDeps, 'ingestion.download', { bookId })

  // Flip the row to "downloading" right after the job is queued so any
  // subsequent read (library list, status poll) sees an in-progress book
  // immediately. Without this the row stayed "discovered" until the worker
  // picked up the job, leaving the UI on "Aguardando ingestão" for seconds and
  // letting short books finish before any progress rendered. The worker's
  // download stage re-affirms this same status, so the write is idempotent.
  // Ordered after the enqueue: a failed enqueue leaves the book "discovered"
  // and retryable.
  await deps.db.update(books).set({ ingestionStatus: 'downloading' }).where(eq(books.id, bookId))

  return {
    book_id: bookId,
    status: 'downloading',
    stage: 'download',
    job_id: jobId,
  }
}
