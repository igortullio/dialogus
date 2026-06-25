import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { CleanError } from '../../domain/ingestion/IngestionError'
import { clean as cleanGutenbergText } from '../../infrastructure/parsing/GutenbergCleaner'
import {
  beginStage,
  cleanFilePath,
  completeStage,
  DEFAULT_STORAGE_ROOT,
  failStage,
  findBookForStage,
  INGESTION_ERROR_SLUGS,
  INGESTION_QUEUES,
  preferredFormat,
  queueStage,
  rawFilePath,
  type StageDeps,
  type StagePayload,
  skipStageCached,
} from './_common'

export type CleanStageDeps = Pick<StageDeps, 'db' | 'logger' | 'pgboss' | 'storageRoot'>

export async function cleanStage(payload: StagePayload, deps: CleanStageDeps): Promise<void> {
  const startedAt = Date.now()
  const storageRoot = deps.storageRoot ?? DEFAULT_STORAGE_ROOT
  const book = await findBookForStage(deps.db, payload.bookId)

  await beginStage(deps.db, book.id, 'clean')

  const format = preferredFormat(book)
  const rawPath = rawFilePath(storageRoot, book.gutendexId, format)
  const cleanPath = cleanFilePath(storageRoot, book.gutendexId)
  let cacheHit = false

  try {
    cacheHit = await fileExists(cleanPath)
    if (cacheHit) {
      await skipStageCached(deps.db, book.id, 'clean')
    } else {
      await mkdir(dirname(cleanPath), { recursive: true })
      const rawText = await readFileAsUtf8(rawPath)
      const cleanedText = cleanGutenbergText(rawText)
      await writeFileStreaming(cleanPath, cleanedText)
      await completeStage(deps.db, book.id, 'clean')
    }
  } catch (error) {
    const wrapped =
      error instanceof CleanError
        ? error
        : new CleanError(`Clean stage failed for book ${book.id}`, { cause: error })
    await failStage(deps.db, book.id, 'clean', `${INGESTION_ERROR_SLUGS.clean}: ${wrapped.message}`)
    deps.logger.error(
      {
        event: 'stage_failed',
        stage: 'clean',
        book_id: book.id,
        gutendex_id: book.gutendexId,
        error_slug: INGESTION_ERROR_SLUGS.clean,
        error_message: wrapped.message,
        retryable: wrapped.retryable,
        duration_ms: Date.now() - startedAt,
      },
      'ingestion stage failed',
    )
    throw wrapped
  }

  await queueStage(deps.db, book.id, 'parse')
  await deps.pgboss.send(INGESTION_QUEUES.parse, { bookId: book.id })

  deps.logger.info(
    {
      event: 'stage_completed',
      stage: 'clean',
      book_id: book.id,
      gutendex_id: book.gutendexId,
      cache_hit: cacheHit,
      duration_ms: Date.now() - startedAt,
    },
    'ingestion stage completed',
  )
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function readFileAsUtf8(path: string): Promise<string> {
  const chunks: string[] = []
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path, { encoding: 'utf8' })
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
    })
    stream.on('end', () => {
      resolve()
    })
    stream.on('error', reject)
  })
  return chunks.join('')
}

async function writeFileStreaming(path: string, content: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(path, { encoding: 'utf8' })
    stream.on('finish', () => {
      resolve()
    })
    stream.on('error', reject)
    stream.end(content)
  })
}
