import { BookNotFoundError, type LibraryEntryRepository } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { books } from '@dialogus/db/schema'
import type { IngestionEnqueueResponseDto } from '@dialogus/shared/schemas/ingestion'
import { eq } from 'drizzle-orm'
import { type EnqueueDeps, enqueue } from '../../infrastructure/pgboss/enqueue'
import { BookNotInDiscoveredStateError, IngestionConcurrencyLimitError } from './errors'

export interface IngestBookDeps {
  readonly db: Database
  readonly libraryRepo: LibraryEntryRepository
  readonly concurrencyLimit: number
  readonly enqueueDeps: EnqueueDeps
  readonly enqueueImpl?: typeof enqueue
}

export async function ingestBook(
  deps: IngestBookDeps,
  userId: string,
  bookId: string,
): Promise<IngestionEnqueueResponseDto> {
  // Membership first: a non-member never learns the book exists or its status (SC-002).
  const isMember = await deps.libraryRepo.isActiveMember(userId, bookId)
  if (!isMember) throw new BookNotFoundError(`Book ${bookId} not found`)

  const row = await deps.db.query.books.findFirst({
    where: eq(books.id, bookId),
    columns: { id: true, ingestionStatus: true },
  })
  if (!row) throw new BookNotFoundError(`Book ${bookId} not found`)
  if (row.ingestionStatus !== 'discovered') {
    throw new BookNotInDiscoveredStateError(bookId, row.ingestionStatus)
  }

  // Per-user concurrency cap (FR-021): the book about to start is still
  // `discovered`, so `countInFlight` (actively-ingesting only) excludes it.
  const inFlight = await deps.libraryRepo.countInFlight(userId)
  if (inFlight >= deps.concurrencyLimit) {
    throw new IngestionConcurrencyLimitError(deps.concurrencyLimit)
  }

  const enqueueFn = deps.enqueueImpl ?? enqueue
  // Deterministic dedup key (FR-012): concurrent first-adds of the same shared
  // book collapse to exactly one ingestion job.
  const jobId = await enqueueFn(
    deps.enqueueDeps,
    'ingestion.download',
    { bookId },
    {
      singletonKey: `ingest-${bookId}`,
    },
  )

  // Flip the row to "downloading" right after the job is queued so any subsequent
  // read (library list, status poll) sees an in-progress book immediately. The
  // worker's download stage re-affirms this status, so the write is idempotent.
  // Ordered after the enqueue: a failed enqueue leaves the book "discovered" and
  // retryable.
  await deps.db.update(books).set({ ingestionStatus: 'downloading' }).where(eq(books.id, bookId))

  return {
    book_id: bookId,
    status: 'downloading',
    stage: 'download',
    job_id: jobId,
  }
}
