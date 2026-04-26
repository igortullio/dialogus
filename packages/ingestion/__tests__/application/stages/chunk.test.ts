import type { Database } from '@dialogus/db/client'
import type { PgBoss } from '@dialogus/db/pgboss'
import { describe, expect, it, vi } from 'vitest'
import type { BookRecordForStage } from '../../../src/application/stages/_common'
import {
  type ChunkStageDeps,
  chunkStage,
  type TokenCounter,
} from '../../../src/application/stages/chunk'
import type { Chapter } from '../../../src/domain/chapter/Chapter'
import type { ChapterRepository } from '../../../src/domain/chapter/ChapterRepository.port'
import type { Chunk } from '../../../src/domain/chunk/Chunk'
import type { ChunkRepository } from '../../../src/domain/chunk/ChunkRepository.port'
import { ChunkError } from '../../../src/domain/ingestion/IngestionError'

const BOOK_ID = 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1'
const GUTENDEX_ID = 1234

interface UpdateCall {
  set: Record<string, unknown>
}

function makeMockDb(book: BookRecordForStage | null) {
  const updates: UpdateCall[] = []
  const findFirst = vi.fn(async () => book ?? undefined)
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's update chain shape
  const updateChain: any = {
    set(value: Record<string, unknown>) {
      this._set = value
      return this
    },
    where(_cond: unknown) {
      updates.push({ set: this._set as Record<string, unknown> })
      return Promise.resolve()
    },
  }
  const db = {
    query: { books: { findFirst } },
    update: vi.fn(() => updateChain),
  } as unknown as Database
  return { db, updates }
}

function makeBook(overrides: Partial<BookRecordForStage> = {}): BookRecordForStage {
  return {
    id: BOOK_ID,
    gutendexId: GUTENDEX_ID,
    languages: ['en'],
    ingestionStatus: 'parsing',
    ingestionLastStage: 'parse',
    ingestionStartedAt: new Date('2026-04-26T10:00:00Z'),
    rawHash: 'some-hash',
    downloadUrlEpub: 'https://example.test/epub',
    downloadUrlTxt: null,
    ...overrides,
  }
}

interface CapturedLog {
  level: 'info' | 'warn' | 'error'
  meta: Record<string, unknown>
  msg: string
}

function makeLogger(): { logger: ChunkStageDeps['logger']; logs: CapturedLog[] } {
  const logs: CapturedLog[] = []
  const logger: ChunkStageDeps['logger'] = {
    info(meta, msg) {
      logs.push({ level: 'info', meta, msg })
    },
    warn(meta, msg) {
      logs.push({ level: 'warn', meta, msg })
    },
    error(meta, msg) {
      logs.push({ level: 'error', meta, msg })
    },
  }
  return { logger, logs }
}

function makePgBoss(): PgBoss & { send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(async () => 'job-id-789')
  return { send } as unknown as PgBoss & { send: ReturnType<typeof vi.fn> }
}

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    bookId: BOOK_ID,
    ordinal: 1,
    title: 'Chapter',
    plainText: 'placeholder',
    tokenCount: 0,
    createdAt: new Date('2026-04-25T10:00:00Z'),
    ...overrides,
  }
}

interface ChapterRepoMock {
  repo: ChapterRepository
  streamByBookId: ReturnType<typeof vi.fn>
  countByBookId: ReturnType<typeof vi.fn>
  streamingOrder: number[]
}

function makeChapterRepo(chapters: readonly Chapter[]): ChapterRepoMock {
  const streamingOrder: number[] = []
  const stream = async function* (_bookId: string): AsyncGenerator<Chapter, void, undefined> {
    for (const ch of chapters) {
      streamingOrder.push(ch.ordinal)
      yield ch
    }
  }
  const streamByBookId = vi.fn(stream)
  const countByBookId = vi.fn(async (_bookId: string) => chapters.length)
  const repo: ChapterRepository = {
    saveMany: vi.fn(async () => {}),
    listByBookId: vi.fn(async () => [...chapters]),
    streamByBookId: streamByBookId as unknown as ChapterRepository['streamByBookId'],
    countByBookId,
    findById: vi.fn(async () => null),
  }
  return { repo, streamByBookId, countByBookId, streamingOrder }
}

interface ChunkRepoMock {
  repo: ChunkRepository
  saveMany: ReturnType<typeof vi.fn>
  countByBookId: ReturnType<typeof vi.fn>
  saved: Chunk[]
}

function makeChunkRepo(existingCount = 0): ChunkRepoMock {
  const saved: Chunk[] = []
  const saveMany = vi.fn(async (batch: readonly Chunk[]) => {
    for (const c of batch) saved.push(c)
  })
  const countByBookId = vi.fn(async (_bookId: string) => existingCount)
  const repo: ChunkRepository = {
    saveMany,
    listByBookId: vi.fn(async () => []),
    listByBookIdWithoutEmbedding: vi.fn(() => ({
      [Symbol.asyncIterator]: async function* () {},
    })) as unknown as ChunkRepository['listByBookIdWithoutEmbedding'],
    updateEmbeddingsBatch: vi.fn(async () => {}),
    countByBookId,
    findById: vi.fn(async () => null),
  }
  return { repo, saveMany, countByBookId, saved }
}

// Word-counting tokenizer: ~one token per whitespace-delimited word. Deterministic, and lets
// tests build paragraphs with predictable token counts independent of cl100k_base specifics.
const wordTokenCounter: TokenCounter = (text) => {
  const trimmed = text.trim()
  if (trimmed.length === 0) return 0
  return trimmed.split(/\s+/).length
}

function paragraphOfTokens(n: number, marker: string): string {
  // produce n distinct words so deduplicated counts don't collapse.
  return Array.from({ length: n }, (_, i) => `${marker}${i}`).join(' ')
}

function buildPlainText(paragraphs: readonly string[]): string {
  return paragraphs.join('\n\n')
}

describe('chunkStage — happy path: chapter under target', () => {
  it('produces a single chunk for a chapter whose paragraphs sum to under 768 tokens', async () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => paragraphOfTokens(50, `p${i}_`))
    const plainText = buildPlainText(paragraphs)
    const chapter = makeChapter({ plainText })
    const book = makeBook()
    const { db, updates } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const chapterRepo = makeChapterRepo([chapter])
    const chunkRepo = makeChunkRepo()

    await chunkStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo: chapterRepo.repo,
        chunkRepo: chunkRepo.repo,
        tokenCounter: wordTokenCounter,
      },
    )

    expect(chunkRepo.saved).toHaveLength(1)
    const only = chunkRepo.saved[0]
    expect(only).toBeDefined()
    expect(only?.tokenCount).toBe(500)
    expect(only?.startChar).toBe(0)
    expect(only?.endChar).toBe(plainText.length)
    expect(only?.embedding).toBeNull()
    expect(only?.text).toBe(plainText)
    expect(pgboss.send).toHaveBeenCalledWith('ingestion.summarize', { bookId: BOOK_ID })
    expect(updates[0]?.set.ingestionStatus).toBe('chunking')
    expect(updates.at(-1)?.set.ingestionProgress).toBe(100)
  })
})

describe('chunkStage — packing + overlap on boundary', () => {
  it('emits two chunks with 10-15% overlap when token total exceeds the target', async () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) => paragraphOfTokens(50, `p${i}_`))
    const plainText = buildPlainText(paragraphs)
    const chapter = makeChapter({ plainText })
    const book = makeBook()
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const chapterRepo = makeChapterRepo([chapter])
    const chunkRepo = makeChunkRepo()

    await chunkStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo: chapterRepo.repo,
        chunkRepo: chunkRepo.repo,
        tokenCounter: wordTokenCounter,
      },
    )

    expect(chunkRepo.saved).toHaveLength(2)
    const [first, second] = chunkRepo.saved
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(first?.tokenCount).toBeLessThanOrEqual(768)
    expect(second?.tokenCount).toBeLessThanOrEqual(768)

    // start_char/end_char ground the chunk text inside chapter plain_text.
    expect(plainText.slice(first?.startChar ?? 0, first?.endChar ?? 0)).toBe(first?.text)
    expect(plainText.slice(second?.startChar ?? 0, second?.endChar ?? 0)).toBe(second?.text)

    // chunks come from the same chapter and are ordered.
    expect(first?.chapterId).toBe(chapter.id)
    expect(second?.chapterId).toBe(chapter.id)
    expect(first?.ordinal).toBe(0)
    expect(second?.ordinal).toBe(1)

    // Overlap: chunk2 must start at or before chunk1's end (paragraphs from chunk1's tail
    // re-included), proving carry-over without splitting paragraphs.
    expect(second?.startChar ?? 0).toBeLessThan(first?.endChar ?? 0)

    // Overlap token count: 75-115 tokens approximately — at minimum one full paragraph (50 tokens)
    // and at most three (150 tokens) given our 50-token paragraphs. Algorithm targets 75-115 so
    // it includes 2 paragraphs of 50 tokens (100 tokens) before stopping.
    const overlapTokens = wordTokenCounter(
      plainText.slice(second?.startChar ?? 0, first?.endChar ?? 0),
    )
    expect(overlapTokens).toBeGreaterThanOrEqual(75)
    expect(overlapTokens).toBeLessThanOrEqual(115)
  })
})

describe('chunkStage — oversize paragraph edge case', () => {
  it('emits a single oversized chunk when one paragraph alone exceeds 768 tokens', async () => {
    const giant = paragraphOfTokens(1500, 'g_')
    const plainText = giant
    const chapter = makeChapter({ plainText })
    const book = makeBook()
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const chapterRepo = makeChapterRepo([chapter])
    const chunkRepo = makeChunkRepo()

    await chunkStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo: chapterRepo.repo,
        chunkRepo: chunkRepo.repo,
        tokenCounter: wordTokenCounter,
      },
    )

    expect(chunkRepo.saved).toHaveLength(1)
    const only = chunkRepo.saved[0]
    expect(only?.tokenCount).toBe(1500)
    expect(only?.text).toBe(plainText)
    expect(only?.startChar).toBe(0)
    expect(only?.endChar).toBe(plainText.length)
  })

  it('flushes the current chunk before yielding the oversized chunk standalone', async () => {
    const small = paragraphOfTokens(100, 'small_')
    const giant = paragraphOfTokens(1000, 'g_')
    const plainText = buildPlainText([small, giant])
    const chapter = makeChapter({ plainText })
    const book = makeBook()
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const chapterRepo = makeChapterRepo([chapter])
    const chunkRepo = makeChunkRepo()

    await chunkStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo: chapterRepo.repo,
        chunkRepo: chunkRepo.repo,
        tokenCounter: wordTokenCounter,
      },
    )

    expect(chunkRepo.saved).toHaveLength(2)
    const [first, second] = chunkRepo.saved
    expect(first?.tokenCount).toBe(100)
    expect(first?.text).toBe(small)
    expect(second?.tokenCount).toBe(1000)
    expect(second?.text).toBe(giant)
  })
})

describe('chunkStage — upstream resume check', () => {
  it('skips chunking and enqueues summarize when chunks already exist', async () => {
    const chapter = makeChapter({ plainText: 'unused' })
    const book = makeBook()
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger, logs } = makeLogger()
    const chapterRepo = makeChapterRepo([chapter])
    const chunkRepo = makeChunkRepo(7)

    await chunkStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo: chapterRepo.repo,
        chunkRepo: chunkRepo.repo,
        tokenCounter: wordTokenCounter,
      },
    )

    expect(chapterRepo.streamByBookId).not.toHaveBeenCalled()
    expect(chunkRepo.saveMany).not.toHaveBeenCalled()
    expect(pgboss.send).toHaveBeenCalledWith('ingestion.summarize', { bookId: BOOK_ID })
    const completion = logs.find((l) => l.meta.event === 'stage_completed')
    expect(completion?.meta).toMatchObject({
      cache_hit: true,
      chunks_count: 7,
    })
  })
})

describe('chunkStage — chapter-at-a-time memory discipline', () => {
  it('streams chapters sequentially and updates progress after each completes', async () => {
    const chapters = [
      makeChapter({
        id: '11111111-1111-1111-1111-111111111111',
        ordinal: 1,
        plainText: paragraphOfTokens(50, 'a_'),
      }),
      makeChapter({
        id: '22222222-2222-2222-2222-222222222222',
        ordinal: 2,
        plainText: paragraphOfTokens(50, 'b_'),
      }),
      makeChapter({
        id: '33333333-3333-3333-3333-333333333333',
        ordinal: 3,
        plainText: paragraphOfTokens(50, 'c_'),
      }),
    ]
    const book = makeBook()
    const { db, updates } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const chapterRepo = makeChapterRepo(chapters)
    const chunkRepo = makeChunkRepo()

    await chunkStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo: chapterRepo.repo,
        chunkRepo: chunkRepo.repo,
        tokenCounter: wordTokenCounter,
      },
    )

    expect(chapterRepo.streamingOrder).toEqual([1, 2, 3])
    expect(chunkRepo.saved).toHaveLength(3)
    expect(chunkRepo.saved[0]?.chapterId).toBe(chapters[0]?.id)
    expect(chunkRepo.saved[1]?.chapterId).toBe(chapters[1]?.id)
    expect(chunkRepo.saved[2]?.chapterId).toBe(chapters[2]?.id)

    // Progress is updated per chapter completed (33, 66) plus a final 100.
    const progressValues = updates
      .map((u) => u.set.ingestionProgress)
      .filter((p): p is number => typeof p === 'number')
    expect(progressValues).toContain(100)
    // Distinct mid-pipeline progress values reflect per-chapter advance (initial 0 + at least 2 per-chapter ticks).
    const distinct = Array.from(new Set(progressValues))
    expect(distinct.length).toBeGreaterThanOrEqual(3)
  })

  it('flushes saveMany when the per-batch threshold of 50 chunks is reached', async () => {
    const giant = paragraphOfTokens(1500, 'big_')
    const chapters = Array.from({ length: 60 }, (_, i) =>
      makeChapter({
        id: `${i.toString().padStart(8, '0')}-1111-1111-1111-111111111111`,
        ordinal: i + 1,
        plainText: giant,
      }),
    )
    const book = makeBook()
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger, logs } = makeLogger()
    const chapterRepo = makeChapterRepo(chapters)
    const chunkRepo = makeChunkRepo()

    await chunkStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo: chapterRepo.repo,
        chunkRepo: chunkRepo.repo,
        tokenCounter: wordTokenCounter,
      },
    )

    expect(chunkRepo.saveMany).toHaveBeenCalledTimes(2)
    expect((chunkRepo.saveMany.mock.calls[0]?.[0] as Chunk[]).length).toBe(50)
    expect((chunkRepo.saveMany.mock.calls[1]?.[0] as Chunk[]).length).toBe(10)
    const batchLogs = logs.filter((l) => l.meta.event === 'chunk_batch_persisted')
    expect(batchLogs).toHaveLength(2)
  })
})

describe('chunkStage — empty chapter', () => {
  it('emits no chunks for a chapter whose plainText has no paragraphs', async () => {
    const chapter = makeChapter({ plainText: '' })
    const book = makeBook()
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const chapterRepo = makeChapterRepo([chapter])
    const chunkRepo = makeChunkRepo()

    await chunkStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo: chapterRepo.repo,
        chunkRepo: chunkRepo.repo,
        tokenCounter: wordTokenCounter,
      },
    )

    expect(chunkRepo.saveMany).not.toHaveBeenCalled()
    expect(pgboss.send).toHaveBeenCalledWith('ingestion.summarize', { bookId: BOOK_ID })
  })
})

describe('chunkStage — default tokenizer (cl100k_base)', () => {
  it('uses js-tiktoken when no tokenCounter is provided and produces deterministic chunks', async () => {
    const text = 'The quick brown fox jumps over the lazy dog.'
    const chapter = makeChapter({ plainText: text })
    const book = makeBook()
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const chapterRepo = makeChapterRepo([chapter])
    const chunkRepo = makeChunkRepo()

    await chunkStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo: chapterRepo.repo,
        chunkRepo: chunkRepo.repo,
      },
    )

    expect(chunkRepo.saved).toHaveLength(1)
    const only = chunkRepo.saved[0]
    expect(only?.text).toBe(text)
    expect(only?.tokenCount).toBeGreaterThan(0)
    expect(only?.tokenCount).toBeLessThan(50)
  })
})

describe('chunkStage — failure path', () => {
  it('marks the book failed, logs an error, and rethrows ChunkError when chunkRepo.saveMany throws', async () => {
    const chapter = makeChapter({ plainText: paragraphOfTokens(50, 'a_') })
    const book = makeBook()
    const { db, updates } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger, logs } = makeLogger()
    const chapterRepo = makeChapterRepo([chapter])
    const chunkRepo = makeChunkRepo()
    chunkRepo.saveMany.mockRejectedValueOnce(new Error('connection lost'))

    await expect(
      chunkStage(
        { bookId: BOOK_ID },
        {
          db,
          logger,
          pgboss,
          chapterRepo: chapterRepo.repo,
          chunkRepo: chunkRepo.repo,
          tokenCounter: wordTokenCounter,
        },
      ),
    ).rejects.toBeInstanceOf(ChunkError)

    expect(pgboss.send).not.toHaveBeenCalled()
    const failureUpdate = updates.at(-1)?.set
    expect(failureUpdate?.ingestionStatus).toBe('failed')
    expect(failureUpdate?.ingestionError).toContain('ingestion-chunk-failed')
    expect(logs.find((l) => l.level === 'error')?.meta).toMatchObject({
      stage: 'chunk',
      error_slug: 'ingestion-chunk-failed',
    })
  })
})
