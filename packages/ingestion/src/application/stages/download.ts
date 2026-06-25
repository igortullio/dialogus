import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { DownloadError } from '../../domain/ingestion/IngestionError'
import {
  beginStage,
  completeStage,
  DEFAULT_STORAGE_ROOT,
  failStage,
  findBookForStage,
  INGESTION_ERROR_SLUGS,
  INGESTION_QUEUES,
  preferredFormat,
  queueStage,
  rawFilePath,
  reportStageUnits,
  type StageDeps,
  type StagePayload,
  skipStageCached,
  updateBookState,
} from './_common'

const DEFAULT_DOWNLOAD_HEARTBEAT_MS = 1000

export type DownloadStageDeps = Pick<
  StageDeps,
  'db' | 'logger' | 'pgboss' | 'downloader' | 'storageRoot' | 'downloadHeartbeatMs'
>

export async function downloadStage(payload: StagePayload, deps: DownloadStageDeps): Promise<void> {
  const startedAt = Date.now()
  const storageRoot = deps.storageRoot ?? DEFAULT_STORAGE_ROOT
  const heartbeatMs = deps.downloadHeartbeatMs ?? DEFAULT_DOWNLOAD_HEARTBEAT_MS
  const book = await findBookForStage(deps.db, payload.bookId)

  await beginStage(deps.db, book.id, 'download', { unit: 'bytes', markStartedAtIfNull: true })

  const format = preferredFormat(book)
  const path = rawFilePath(storageRoot, book.gutendexId, format)
  let cacheHit = false
  let bytes: number | undefined

  try {
    cacheHit = book.rawHash != null && (await fileMatchesHash(path, book.rawHash))
    if (cacheHit) {
      await skipStageCached(deps.db, book.id, 'download')
    } else {
      // The Gutenberg mirror can be slow; a heartbeat keeps `updated_at` advancing
      // so the UI shows movement (not a frozen 0%) and stall-detection doesn't fire.
      const stopHeartbeat = startHeartbeat(deps, book.id, heartbeatMs)
      try {
        const result = await deps.downloader.download(book.gutendexId, format)
        bytes = result.bytes
        await updateBookState(deps.db, book.id, { rawHash: result.sha256 })
      } finally {
        stopHeartbeat()
      }
      await reportStageUnits(deps.db, book.id, 'download', bytes ?? 0, {
        unitsTotal: bytes ?? null,
        unit: 'bytes',
        progress: 99,
      })
      await completeStage(deps.db, book.id, 'download')
    }
  } catch (error) {
    const wrapped =
      error instanceof DownloadError
        ? error
        : new DownloadError(`Download stage failed for book ${book.id}`, { cause: error })
    await failStage(
      deps.db,
      book.id,
      'download',
      `${INGESTION_ERROR_SLUGS.download}: ${wrapped.message}`,
    )
    deps.logger.error(
      {
        event: 'stage_failed',
        stage: 'download',
        book_id: book.id,
        gutendex_id: book.gutendexId,
        error_slug: INGESTION_ERROR_SLUGS.download,
        error_message: wrapped.message,
        retryable: wrapped.retryable,
        duration_ms: Date.now() - startedAt,
      },
      'ingestion stage failed',
    )
    throw wrapped
  }

  await queueStage(deps.db, book.id, 'clean')
  await deps.pgboss.send(INGESTION_QUEUES.clean, { bookId: book.id })

  deps.logger.info(
    {
      event: 'stage_completed',
      stage: 'download',
      book_id: book.id,
      gutendex_id: book.gutendexId,
      cache_hit: cacheHit,
      bytes,
      duration_ms: Date.now() - startedAt,
    },
    'ingestion stage completed',
  )
}

/** Periodically bump `updated_at` while a long download is in flight. */
function startHeartbeat(deps: DownloadStageDeps, bookId: string, intervalMs: number): () => void {
  const timer = setInterval(() => {
    void updateBookState(deps.db, bookId, {}).catch((error: unknown) => {
      deps.logger.warn(
        { event: 'download_heartbeat_failed', book_id: bookId, error },
        'heartbeat failed',
      )
    })
  }, intervalMs)
  // Don't keep the worker process alive solely for the heartbeat.
  if (typeof timer.unref === 'function') timer.unref()
  return () => clearInterval(timer)
}

async function fileMatchesHash(path: string, expectedHash: string): Promise<boolean> {
  try {
    await stat(path)
  } catch {
    return false
  }
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk: Buffer | string) => {
      hash.update(chunk)
    })
    stream.on('end', () => {
      resolve()
    })
    stream.on('error', reject)
  })
  return hash.digest('hex') === expectedHash
}
