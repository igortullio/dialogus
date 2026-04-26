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

  return {
    book_id: bookId,
    status: 'downloading',
    stage: 'download',
    job_id: jobId,
  }
}
