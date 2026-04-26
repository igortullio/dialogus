import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { DownloadError } from '../../domain/ingestion/IngestionError'
import {
  DEFAULT_STORAGE_ROOT,
  findBookForStage,
  INGESTION_ERROR_SLUGS,
  INGESTION_QUEUES,
  preferredFormat,
  rawFilePath,
  type StageDeps,
  type StagePayload,
  updateBookState,
} from './_common'

export type DownloadStageDeps = Pick<
  StageDeps,
  'db' | 'logger' | 'pgboss' | 'downloader' | 'storageRoot'
>

export async function downloadStage(payload: StagePayload, deps: DownloadStageDeps): Promise<void> {
  const startedAt = Date.now()
  const storageRoot = deps.storageRoot ?? DEFAULT_STORAGE_ROOT
  const book = await findBookForStage(deps.db, payload.bookId)

  await updateBookState(deps.db, book.id, {
    ingestionStatus: 'downloading',
    ingestionProgress: 0,
    ingestionLastStage: 'download',
    ingestionError: null,
    markStartedAtIfNull: true,
  })

  const format = preferredFormat(book)
  const path = rawFilePath(storageRoot, book.gutendexId, format)
  let cacheHit = false
  let bytes: number | undefined

  try {
    cacheHit = book.rawHash != null && (await fileMatchesHash(path, book.rawHash))
    if (cacheHit) {
      await updateBookState(deps.db, book.id, { ingestionProgress: 100 })
    } else {
      const result = await deps.downloader.download(book.gutendexId, format)
      bytes = result.bytes
      await updateBookState(deps.db, book.id, {
        rawHash: result.sha256,
        ingestionProgress: 100,
      })
    }
  } catch (error) {
    const wrapped =
      error instanceof DownloadError
        ? error
        : new DownloadError(`Download stage failed for book ${book.id}`, { cause: error })
    await updateBookState(deps.db, book.id, {
      ingestionStatus: 'failed',
      ingestionError: `${INGESTION_ERROR_SLUGS.download}: ${wrapped.message}`,
    })
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
