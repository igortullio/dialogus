import type { Chunk } from '../../domain/chunk/Chunk'
import type { ChunkEmbeddingUpdate } from '../../domain/chunk/ChunkRepository.port'
import { EmbedError } from '../../domain/ingestion/IngestionError'
import {
  type BookRecordForStage,
  beginStage,
  completeStage,
  failStage,
  findBookForStage,
  INGESTION_ERROR_SLUGS,
  INGESTION_QUEUES,
  queueStage,
  reportStageUnits,
  type StageDeps,
  type StageLogger,
  type StagePayload,
} from './_common'

const BATCH_SIZE = 100

export type EmbedStageDeps = Pick<
  StageDeps,
  'db' | 'logger' | 'pgboss' | 'chunkRepo' | 'embeddingProvider'
>

export async function embedStage(payload: StagePayload, deps: EmbedStageDeps): Promise<void> {
  const startedAt = Date.now()
  const book = await findBookForStage(deps.db, payload.bookId)

  await beginStage(deps.db, book.id, 'embed', { unit: 'chunks' })

  let totalEmbedded = 0
  let totalBatches = 0

  try {
    const totalPending = await deps.chunkRepo.countByBookIdWithoutEmbedding(book.id)
    const expectedBatches = Math.max(1, Math.ceil(totalPending / BATCH_SIZE))
    await reportStageUnits(deps.db, book.id, 'embed', 0, {
      unitsTotal: totalPending,
      unit: 'chunks',
      progress: 0,
    })

    let buffer: Chunk[] = []
    for await (const chunk of deps.chunkRepo.listByBookIdWithoutEmbedding(book.id)) {
      buffer.push(chunk)
      if (buffer.length >= BATCH_SIZE) {
        await processBatch(buffer, deps, book)
        totalEmbedded += buffer.length
        totalBatches += 1
        await reportStageUnits(deps.db, book.id, 'embed', totalEmbedded, {
          unitsTotal: totalPending,
          unit: 'chunks',
          progress: batchProgress(totalBatches, expectedBatches),
        })
        logBatch(deps.logger, book, buffer.length, totalEmbedded)
        buffer = []
      }
    }
    if (buffer.length > 0) {
      await processBatch(buffer, deps, book)
      totalEmbedded += buffer.length
      totalBatches += 1
      logBatch(deps.logger, book, buffer.length, totalEmbedded)
    }
    await completeStage(deps.db, book.id, 'embed')
  } catch (error) {
    const wrapped =
      error instanceof EmbedError
        ? error
        : new EmbedError(`Embed stage failed for book ${book.id}`, { cause: error })
    await failStage(deps.db, book.id, 'embed', `${INGESTION_ERROR_SLUGS.embed}: ${wrapped.message}`)
    deps.logger.error(
      {
        event: 'stage_failed',
        stage: 'embed',
        book_id: book.id,
        gutendex_id: book.gutendexId,
        error_slug: INGESTION_ERROR_SLUGS.embed,
        error_message: wrapped.message,
        retryable: wrapped.retryable,
        duration_ms: Date.now() - startedAt,
      },
      'ingestion stage failed',
    )
    throw wrapped
  }

  await queueStage(deps.db, book.id, 'index')
  await deps.pgboss.send(INGESTION_QUEUES.index, { bookId: book.id })

  deps.logger.info(
    {
      event: 'stage_completed',
      stage: 'embed',
      book_id: book.id,
      gutendex_id: book.gutendexId,
      batches_count: totalBatches,
      embeddings_count: totalEmbedded,
      duration_ms: Date.now() - startedAt,
    },
    'ingestion stage completed',
  )
}

async function processBatch(
  batch: readonly Chunk[],
  deps: EmbedStageDeps,
  book: BookRecordForStage,
): Promise<void> {
  const texts = batch.map((c) => c.text)
  const vectors = await deps.embeddingProvider.embed(texts)
  if (vectors.length !== batch.length) {
    throw new EmbedError(
      `Embedding provider returned ${vectors.length} vectors for ${batch.length} chunks (book ${book.id})`,
    )
  }
  const updates: ChunkEmbeddingUpdate[] = batch.map((chunk, i) => {
    const embedding = vectors[i]
    if (!embedding) {
      throw new EmbedError(
        `Embedding provider returned undefined vector at index ${i} (book ${book.id})`,
      )
    }
    return { id: chunk.id, embedding }
  })
  await deps.chunkRepo.updateEmbeddingsBatch(updates)
}

function batchProgress(batchesDone: number, expectedBatches: number): number {
  if (expectedBatches <= 0) return 0
  const ratio = batchesDone / expectedBatches
  return Math.min(99, Math.max(0, Math.floor(ratio * 100)))
}

function logBatch(
  logger: StageLogger,
  book: BookRecordForStage,
  batchSize: number,
  embeddingsPersistedSoFar: number,
): void {
  logger.info(
    {
      event: 'embed_batch_persisted',
      stage: 'embed',
      book_id: book.id,
      gutendex_id: book.gutendexId,
      batch_size: batchSize,
      embeddings_persisted_so_far: embeddingsPersistedSoFar,
    },
    'embed batch persisted',
  )
}
