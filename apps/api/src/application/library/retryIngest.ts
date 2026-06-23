import { BookNotFoundError, type LibraryEntryRepository } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { books } from '@dialogus/db/schema'
import type {
  IngestionEnqueueResponseDto,
  IngestionStage,
  IngestionStatus,
} from '@dialogus/shared/schemas/ingestion'
import { eq } from 'drizzle-orm'
import { type EnqueueDeps, enqueue } from '../../infrastructure/pgboss/enqueue'
import { BookAlreadyReadyError, BookNotInRetryableStateError } from './errors'
import { isIngestionStage } from './ingestionStatus'

export interface RetryIngestBookDeps {
  readonly db: Database
  readonly libraryRepo: LibraryEntryRepository
  readonly enqueueDeps: EnqueueDeps
  readonly enqueueImpl?: typeof enqueue
}

const STAGE_TO_RUNNING_STATUS: Record<IngestionStage, IngestionStatus> = {
  download: 'downloading',
  clean: 'cleaning',
  parse: 'parsing',
  chunk: 'chunking',
  summarize: 'summarizing',
  embed: 'embedding',
  index: 'indexing',
}

export async function retryIngestBook(
  deps: RetryIngestBookDeps,
  userId: string,
  bookId: string,
): Promise<IngestionEnqueueResponseDto> {
  // Membership-gated retry of a failed shared title (SC-002).
  const isMember = await deps.libraryRepo.isActiveMember(userId, bookId)
  if (!isMember) throw new BookNotFoundError(`Book ${bookId} not found`)

  const row = await deps.db.query.books.findFirst({
    where: eq(books.id, bookId),
    columns: { id: true, ingestionStatus: true, ingestionLastStage: true },
  })
  if (!row) throw new BookNotFoundError(`Book ${bookId} not found`)
  if (row.ingestionStatus === 'ready') throw new BookAlreadyReadyError(bookId)
  if (row.ingestionStatus !== 'failed') {
    throw new BookNotInRetryableStateError(bookId, row.ingestionStatus)
  }

  const lastStage = row.ingestionLastStage
  const resumeStage: IngestionStage =
    lastStage !== null && isIngestionStage(lastStage) ? lastStage : 'download'

  const enqueueFn = deps.enqueueImpl ?? enqueue
  const jobId = await enqueueFn(deps.enqueueDeps, `ingestion.${resumeStage}`, { bookId })

  return {
    book_id: bookId,
    status: STAGE_TO_RUNNING_STATUS[resumeStage],
    stage: resumeStage,
    job_id: jobId,
  }
}
