import type { Database } from '@dialogus/db/client'
import type { PgBoss } from '@dialogus/db/pgboss'
import { books, type IngestionStatus } from '@dialogus/db/schema'
import { eq, sql } from 'drizzle-orm'
import type { ChapterRepository } from '../../domain/chapter/ChapterRepository.port'
import type { ChunkRepository } from '../../domain/chunk/ChunkRepository.port'
import type { EmbeddingProvider } from '../../domain/embedding/EmbeddingProvider.port'
import type { ChapterParser } from '../../domain/parser/ChapterParser.port'
import type { GutendexDownloader } from '../../infrastructure/external/GutendexDownloader'

export interface StagePayload {
  readonly bookId: string
}

export interface StageLogger {
  info(meta: Record<string, unknown>, msg: string): void
  warn(meta: Record<string, unknown>, msg: string): void
  error(meta: Record<string, unknown>, msg: string): void
}

export interface StageDeps {
  readonly db: Database
  readonly logger: StageLogger
  readonly chapterRepo: ChapterRepository
  readonly chunkRepo: ChunkRepository
  readonly embeddingProvider: EmbeddingProvider
  readonly chapterParser: ChapterParser
  readonly downloader: GutendexDownloader
  readonly pgboss: PgBoss
  readonly storageRoot?: string
}

export type StageHandler = (payload: StagePayload, deps: StageDeps) => Promise<void>

export const DEFAULT_STORAGE_ROOT = './storage'

export const INGESTION_QUEUES = {
  download: 'ingestion.download',
  clean: 'ingestion.clean',
  parse: 'ingestion.parse',
  chunk: 'ingestion.chunk',
  summarize: 'ingestion.summarize',
  embed: 'ingestion.embed',
  index: 'ingestion.index',
} as const

export type IngestionQueue = (typeof INGESTION_QUEUES)[keyof typeof INGESTION_QUEUES]

export const INGESTION_ERROR_SLUGS = {
  download: 'ingestion-download-failed',
  clean: 'ingestion-clean-failed',
  parse: 'ingestion-parse-failed',
  chunk: 'ingestion-chunk-failed',
  summarize: 'ingestion-summarize-failed',
  embed: 'ingestion-embed-failed',
  index: 'ingestion-index-failed',
} as const

export type IngestionErrorSlug = (typeof INGESTION_ERROR_SLUGS)[keyof typeof INGESTION_ERROR_SLUGS]

export interface BookRecordForStage {
  readonly id: string
  readonly gutendexId: number
  readonly ingestionStatus: IngestionStatus
  readonly ingestionLastStage: string | null
  readonly ingestionStartedAt: Date | null
  readonly rawHash: string | null
  readonly downloadUrlEpub: string | null
  readonly downloadUrlTxt: string | null
}

export class BookNotFoundForStageError extends Error {
  constructor(public readonly bookId: string) {
    super(`Book ${bookId} not found`)
    this.name = 'BookNotFoundForStageError'
  }
}

export async function findBookForStage(db: Database, bookId: string): Promise<BookRecordForStage> {
  const row = await db.query.books.findFirst({
    where: eq(books.id, bookId),
    columns: {
      id: true,
      gutendexId: true,
      ingestionStatus: true,
      ingestionLastStage: true,
      ingestionStartedAt: true,
      rawHash: true,
      downloadUrlEpub: true,
      downloadUrlTxt: true,
    },
  })
  if (!row) throw new BookNotFoundForStageError(bookId)
  return row
}

export interface BookStateUpdate {
  readonly ingestionStatus?: IngestionStatus
  readonly ingestionProgress?: number
  readonly ingestionLastStage?: string | null
  readonly ingestionError?: string | null
  readonly rawHash?: string | null
  readonly indexedAt?: Date | null
  readonly markStartedAtIfNull?: boolean
}

export async function updateBookState(
  db: Database,
  bookId: string,
  update: BookStateUpdate,
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: sql`now()` }
  if (update.ingestionStatus !== undefined) set.ingestionStatus = update.ingestionStatus
  if (update.ingestionProgress !== undefined) set.ingestionProgress = update.ingestionProgress
  if (update.ingestionLastStage !== undefined) set.ingestionLastStage = update.ingestionLastStage
  if (update.ingestionError !== undefined) set.ingestionError = update.ingestionError
  if (update.rawHash !== undefined) set.rawHash = update.rawHash
  if (update.indexedAt !== undefined) set.indexedAt = update.indexedAt
  if (update.markStartedAtIfNull === true) {
    set.ingestionStartedAt = sql`COALESCE(${books.ingestionStartedAt}, now())`
  }
  await db.update(books).set(set).where(eq(books.id, bookId))
}

export function preferredFormat(book: BookRecordForStage): 'epub' | 'txt' {
  if (book.downloadUrlEpub) return 'epub'
  if (book.downloadUrlTxt) return 'txt'
  return 'epub'
}

export function rawFilePath(
  storageRoot: string,
  gutendexId: number,
  format: 'epub' | 'txt',
): string {
  return `${storageRoot}/raw/${gutendexId}.${format}`
}

export function cleanFilePath(storageRoot: string, gutendexId: number): string {
  return `${storageRoot}/clean/${gutendexId}.txt`
}
