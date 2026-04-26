import { randomUUID } from 'node:crypto'
import type { Chapter } from '../../domain/chapter/Chapter'
import { ParseError } from '../../domain/ingestion/IngestionError'
import type { ParsedChapter, SupportedLanguage } from '../../domain/parser/ChapterParser.port'
import {
  type BookRecordForStage,
  cleanFilePath,
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

const BATCH_SIZE = 50

export type ParseStageDeps = Pick<
  StageDeps,
  'db' | 'logger' | 'pgboss' | 'chapterRepo' | 'chapterParser' | 'txtChapterParser' | 'storageRoot'
>

export async function parseStage(payload: StagePayload, deps: ParseStageDeps): Promise<void> {
  const startedAt = Date.now()
  const storageRoot = deps.storageRoot ?? DEFAULT_STORAGE_ROOT
  const book = await findBookForStage(deps.db, payload.bookId)

  await updateBookState(deps.db, book.id, {
    ingestionStatus: 'parsing',
    ingestionProgress: 0,
    ingestionLastStage: 'parse',
    ingestionError: null,
  })

  let totalChapters = 0
  let cacheHit = false

  try {
    const existingCount = await deps.chapterRepo.countByBookId(book.id)
    if (existingCount > 0) {
      cacheHit = true
      totalChapters = existingCount
      await updateBookState(deps.db, book.id, { ingestionProgress: 100 })
    } else {
      totalChapters = await streamAndPersistChapters(book, storageRoot, deps)
      if (totalChapters === 0) {
        throw new ParseError(
          `No chapters extracted for book ${book.id} (gutendex ${book.gutendexId})`,
        )
      }
      await updateBookState(deps.db, book.id, { ingestionProgress: 100 })
    }
  } catch (error) {
    const wrapped =
      error instanceof ParseError
        ? error
        : new ParseError(`Parse stage failed for book ${book.id}`, { cause: error })
    await updateBookState(deps.db, book.id, {
      ingestionStatus: 'failed',
      ingestionError: `${INGESTION_ERROR_SLUGS.parse}: ${wrapped.message}`,
    })
    deps.logger.error(
      {
        event: 'stage_failed',
        stage: 'parse',
        book_id: book.id,
        gutendex_id: book.gutendexId,
        error_slug: INGESTION_ERROR_SLUGS.parse,
        error_message: wrapped.message,
        retryable: wrapped.retryable,
        duration_ms: Date.now() - startedAt,
      },
      'ingestion stage failed',
    )
    throw wrapped
  }

  await deps.pgboss.send(INGESTION_QUEUES.chunk, { bookId: book.id })

  deps.logger.info(
    {
      event: 'stage_completed',
      stage: 'parse',
      book_id: book.id,
      gutendex_id: book.gutendexId,
      cache_hit: cacheHit,
      chapters_count: totalChapters,
      duration_ms: Date.now() - startedAt,
    },
    'ingestion stage completed',
  )
}

async function streamAndPersistChapters(
  book: BookRecordForStage,
  storageRoot: string,
  deps: ParseStageDeps,
): Promise<number> {
  const language = resolveLanguage(book.languages)
  const format = preferredFormat(book)
  const parser = format === 'epub' ? deps.chapterParser : deps.txtChapterParser
  const sourcePath =
    format === 'epub'
      ? rawFilePath(storageRoot, book.gutendexId, 'epub')
      : cleanFilePath(storageRoot, book.gutendexId)

  let buffer: Chapter[] = []
  let persisted = 0
  for await (const parsed of parser.parse(sourcePath, language)) {
    buffer.push(toDomainChapter(book.id, parsed))
    if (buffer.length >= BATCH_SIZE) {
      await deps.chapterRepo.saveMany(buffer)
      persisted += buffer.length
      logBatch(deps, book, buffer.length, persisted)
      await updateBookState(deps.db, book.id, { ingestionProgress: 50 })
      buffer = []
    }
  }
  if (buffer.length > 0) {
    await deps.chapterRepo.saveMany(buffer)
    persisted += buffer.length
    logBatch(deps, book, buffer.length, persisted)
  }
  return persisted
}

function logBatch(
  deps: ParseStageDeps,
  book: BookRecordForStage,
  batchSize: number,
  chaptersPersistedSoFar: number,
): void {
  deps.logger.info(
    {
      event: 'parse_batch_persisted',
      stage: 'parse',
      book_id: book.id,
      gutendex_id: book.gutendexId,
      batch_size: batchSize,
      chapters_persisted_so_far: chaptersPersistedSoFar,
    },
    'parse batch persisted',
  )
}

function toDomainChapter(bookId: string, parsed: ParsedChapter): Chapter {
  return {
    id: randomUUID(),
    bookId,
    ordinal: parsed.ordinal,
    title: parsed.title,
    plainText: parsed.plainText,
    tokenCount: parsed.tokenCount,
    createdAt: new Date(),
  }
}

function resolveLanguage(languages: readonly string[]): SupportedLanguage {
  for (const lang of languages) {
    const normalized = lang.toLowerCase().slice(0, 2)
    if (normalized === 'pt') return 'pt'
    if (normalized === 'en') return 'en'
  }
  return 'en'
}
