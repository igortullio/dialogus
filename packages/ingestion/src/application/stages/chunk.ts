import { randomUUID } from 'node:crypto'
import { getEncoding, type Tiktoken } from 'js-tiktoken'
import type { Chapter } from '../../domain/chapter/Chapter'
import type { Chunk } from '../../domain/chunk/Chunk'
import { ChunkError } from '../../domain/ingestion/IngestionError'
import {
  type BookRecordForStage,
  findBookForStage,
  INGESTION_ERROR_SLUGS,
  INGESTION_QUEUES,
  type StageDeps,
  type StageLogger,
  type StagePayload,
  updateBookState,
} from './_common'

const TARGET_TOKENS = 768
const OVERLAP_MIN_TOKENS = 75
const OVERLAP_MAX_TOKENS = 115
const BATCH_SIZE = 50
const TOKEN_ENCODING = 'cl100k_base' as const

export type TokenCounter = (text: string) => number

export type ChunkStageDeps = Pick<
  StageDeps,
  'db' | 'logger' | 'pgboss' | 'chapterRepo' | 'chunkRepo'
> & {
  readonly tokenCounter?: TokenCounter
}

let cachedDefaultEncoder: Tiktoken | null = null

function defaultTokenCounter(text: string): number {
  if (!cachedDefaultEncoder) {
    cachedDefaultEncoder = getEncoding(TOKEN_ENCODING)
  }
  return cachedDefaultEncoder.encode(text).length
}

interface Paragraph {
  readonly text: string
  readonly startChar: number
  readonly endChar: number
  readonly tokenCount: number
}

interface PendingChunk {
  readonly paragraphs: Paragraph[]
  readonly startChar: number
  readonly endChar: number
  readonly tokenCount: number
}

export async function chunkStage(payload: StagePayload, deps: ChunkStageDeps): Promise<void> {
  const startedAt = Date.now()
  const tokenCounter = deps.tokenCounter ?? defaultTokenCounter
  const book = await findBookForStage(deps.db, payload.bookId)

  await updateBookState(deps.db, book.id, {
    ingestionStatus: 'chunking',
    ingestionProgress: 0,
    ingestionLastStage: 'chunk',
    ingestionError: null,
  })

  let totalChunks = 0
  let totalChapters = 0
  let cacheHit = false

  try {
    const existingChunks = await deps.chunkRepo.countByBookId(book.id)
    if (existingChunks > 0) {
      cacheHit = true
      totalChunks = existingChunks
      totalChapters = await deps.chapterRepo.countByBookId(book.id)
      await updateBookState(deps.db, book.id, { ingestionProgress: 100 })
    } else {
      totalChapters = await deps.chapterRepo.countByBookId(book.id)
      totalChunks = await streamAndPersistChunks(book, totalChapters, tokenCounter, deps)
      await updateBookState(deps.db, book.id, { ingestionProgress: 100 })
    }
  } catch (error) {
    const wrapped =
      error instanceof ChunkError
        ? error
        : new ChunkError(`Chunk stage failed for book ${book.id}`, { cause: error })
    await updateBookState(deps.db, book.id, {
      ingestionStatus: 'failed',
      ingestionError: `${INGESTION_ERROR_SLUGS.chunk}: ${wrapped.message}`,
    })
    deps.logger.error(
      {
        event: 'stage_failed',
        stage: 'chunk',
        book_id: book.id,
        gutendex_id: book.gutendexId,
        error_slug: INGESTION_ERROR_SLUGS.chunk,
        error_message: wrapped.message,
        retryable: wrapped.retryable,
        duration_ms: Date.now() - startedAt,
      },
      'ingestion stage failed',
    )
    throw wrapped
  }

  await deps.pgboss.send(INGESTION_QUEUES.summarize, { bookId: book.id })

  deps.logger.info(
    {
      event: 'stage_completed',
      stage: 'chunk',
      book_id: book.id,
      gutendex_id: book.gutendexId,
      cache_hit: cacheHit,
      chapters_count: totalChapters,
      chunks_count: totalChunks,
      duration_ms: Date.now() - startedAt,
    },
    'ingestion stage completed',
  )
}

async function streamAndPersistChunks(
  book: BookRecordForStage,
  totalChapters: number,
  tokenCounter: TokenCounter,
  deps: ChunkStageDeps,
): Promise<number> {
  let buffer: Chunk[] = []
  let persistedChunks = 0
  let processedChapters = 0

  for await (const chapter of deps.chapterRepo.streamByBookId(book.id)) {
    let chapterOrdinal = 0
    for (const pending of chunkChapter(chapter, tokenCounter)) {
      buffer.push(toDomainChunk(book.id, chapter, chapterOrdinal++, pending))
      if (buffer.length >= BATCH_SIZE) {
        await deps.chunkRepo.saveMany(buffer)
        persistedChunks += buffer.length
        logBatch(deps.logger, book, buffer.length, persistedChunks)
        buffer = []
      }
    }
    processedChapters += 1
    if (totalChapters > 0) {
      const progress = Math.min(99, Math.floor((processedChapters / totalChapters) * 100))
      await updateBookState(deps.db, book.id, { ingestionProgress: progress })
    }
  }
  if (buffer.length > 0) {
    await deps.chunkRepo.saveMany(buffer)
    persistedChunks += buffer.length
    logBatch(deps.logger, book, buffer.length, persistedChunks)
  }
  return persistedChunks
}

interface ChunkBuilderState {
  buffer: Paragraph[]
  tokens: number
}

function emitBuffer(state: ChunkBuilderState): PendingChunk {
  const first = state.buffer[0]
  const last = state.buffer[state.buffer.length - 1]
  if (!first || !last) {
    throw new Error('Cannot emit empty chunk buffer')
  }
  return {
    paragraphs: state.buffer,
    startChar: first.startChar,
    endChar: last.endChar,
    tokenCount: state.tokens,
  }
}

function startNextChunk(emitted: PendingChunk, p: Paragraph): ChunkBuilderState {
  const overlap = computeOverlap(emitted.paragraphs)
  const overlapTokens = overlap.reduce((sum, x) => sum + x.tokenCount, 0)
  if (overlapTokens + p.tokenCount > TARGET_TOKENS) {
    return { buffer: [p], tokens: p.tokenCount }
  }
  return { buffer: [...overlap, p], tokens: overlapTokens + p.tokenCount }
}

export function* chunkChapter(
  chapter: Pick<Chapter, 'plainText'>,
  tokenCounter: TokenCounter,
): Generator<PendingChunk> {
  const paragraphs = parseParagraphs(chapter.plainText, tokenCounter)
  if (paragraphs.length === 0) return

  let state: ChunkBuilderState = { buffer: [], tokens: 0 }

  for (const p of paragraphs) {
    if (p.tokenCount > TARGET_TOKENS) {
      if (state.buffer.length > 0) {
        yield emitBuffer(state)
        state = { buffer: [], tokens: 0 }
      }
      yield {
        paragraphs: [p],
        startChar: p.startChar,
        endChar: p.endChar,
        tokenCount: p.tokenCount,
      }
      continue
    }
    if (state.buffer.length === 0) {
      state = { buffer: [p], tokens: p.tokenCount }
      continue
    }
    if (state.tokens + p.tokenCount > TARGET_TOKENS) {
      const emitted = emitBuffer(state)
      yield emitted
      state = startNextChunk(emitted, p)
      continue
    }
    state.buffer.push(p)
    state.tokens += p.tokenCount
  }

  if (state.buffer.length > 0) {
    yield emitBuffer(state)
  }
}

function computeOverlap(paragraphs: readonly Paragraph[]): Paragraph[] {
  const overlap: Paragraph[] = []
  let tokens = 0
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i]
    if (!p) break
    if (tokens >= OVERLAP_MIN_TOKENS) break
    if (overlap.length > 0 && tokens + p.tokenCount > OVERLAP_MAX_TOKENS) break
    overlap.unshift(p)
    tokens += p.tokenCount
  }
  return overlap
}

function parseParagraphs(plainText: string, tokenCounter: TokenCounter): Paragraph[] {
  const paragraphs: Paragraph[] = []
  const separator = /\n\n+/g
  let cursor = 0
  let match: RegExpExecArray | null = separator.exec(plainText)
  while (match !== null) {
    const segment = plainText.slice(cursor, match.index)
    if (segment.trim().length > 0) {
      paragraphs.push({
        text: segment,
        startChar: cursor,
        endChar: match.index,
        tokenCount: tokenCounter(segment),
      })
    }
    cursor = match.index + match[0].length
    match = separator.exec(plainText)
  }
  const tail = plainText.slice(cursor)
  if (tail.trim().length > 0) {
    paragraphs.push({
      text: tail,
      startChar: cursor,
      endChar: plainText.length,
      tokenCount: tokenCounter(tail),
    })
  }
  return paragraphs
}

function toDomainChunk(
  bookId: string,
  chapter: Pick<Chapter, 'id' | 'plainText'>,
  ordinal: number,
  pending: PendingChunk,
): Chunk {
  return {
    id: randomUUID(),
    bookId,
    chapterId: chapter.id,
    ordinal,
    text: chapter.plainText.slice(pending.startChar, pending.endChar),
    tokenCount: pending.tokenCount,
    startChar: pending.startChar,
    endChar: pending.endChar,
    embedding: null,
    createdAt: new Date(),
  }
}

function logBatch(
  logger: StageLogger,
  book: BookRecordForStage,
  batchSize: number,
  chunksPersistedSoFar: number,
): void {
  logger.info(
    {
      event: 'chunk_batch_persisted',
      stage: 'chunk',
      book_id: book.id,
      gutendex_id: book.gutendexId,
      batch_size: batchSize,
      chunks_persisted_so_far: chunksPersistedSoFar,
    },
    'chunk batch persisted',
  )
}
