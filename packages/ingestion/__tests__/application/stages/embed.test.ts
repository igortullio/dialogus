import type { Database } from '@dialogus/db/client'
import type { PgBoss } from '@dialogus/db/pgboss'
import { describe, expect, it, vi } from 'vitest'
import type { BookRecordForStage } from '../../../src/application/stages/_common'
import { type EmbedStageDeps, embedStage } from '../../../src/application/stages/embed'
import type { Chunk } from '../../../src/domain/chunk/Chunk'
import type {
  ChunkEmbeddingUpdate,
  ChunkRepository,
} from '../../../src/domain/chunk/ChunkRepository.port'
import type { EmbeddingProvider } from '../../../src/domain/embedding/EmbeddingProvider.port'
import { EmbedError } from '../../../src/domain/ingestion/IngestionError'

const BOOK_ID = 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1'
const GUTENDEX_ID = 1234
const EMBED_DIMS = 1536

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
    ingestionStatus: 'chunking',
    ingestionLastStage: 'chunk',
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

function makeLogger(): { logger: EmbedStageDeps['logger']; logs: CapturedLog[] } {
  const logs: CapturedLog[] = []
  const logger: EmbedStageDeps['logger'] = {
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
  const send = vi.fn(async () => 'job-id-123')
  return { send } as unknown as PgBoss & { send: ReturnType<typeof vi.fn> }
}

function makeChunk(overrides: Partial<Chunk> = {}): Chunk {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    bookId: BOOK_ID,
    chapterId: '22222222-2222-2222-2222-222222222222',
    ordinal: 0,
    text: 'placeholder text',
    tokenCount: 10,
    startChar: 0,
    endChar: 16,
    embedding: null,
    createdAt: new Date('2026-04-26T10:05:00Z'),
    ...overrides,
  }
}

function makeChunks(count: number): Chunk[] {
  return Array.from({ length: count }, (_, i) =>
    makeChunk({
      id: `${i.toString().padStart(8, '0')}-1111-1111-1111-111111111111`,
      ordinal: i,
      text: `chunk text ${i}`,
    }),
  )
}

interface ChunkRepoMock {
  repo: ChunkRepository
  countByBookIdWithoutEmbedding: ReturnType<typeof vi.fn>
  listByBookIdWithoutEmbedding: ReturnType<typeof vi.fn>
  updateEmbeddingsBatch: ReturnType<typeof vi.fn>
  updates: ChunkEmbeddingUpdate[][]
}

function makeChunkRepo(chunks: readonly Chunk[]): ChunkRepoMock {
  const updates: ChunkEmbeddingUpdate[][] = []
  const stream = async function* (): AsyncGenerator<Chunk, void, undefined> {
    for (const c of chunks) yield c
  }
  const listByBookIdWithoutEmbedding = vi.fn(stream)
  const countByBookIdWithoutEmbedding = vi.fn(async () => chunks.length)
  const updateEmbeddingsBatch = vi.fn(async (batch: readonly ChunkEmbeddingUpdate[]) => {
    updates.push([...batch])
  })
  const repo: ChunkRepository = {
    saveMany: vi.fn(async () => {}),
    listByBookId: vi.fn(async () => [...chunks]),
    listByBookIdWithoutEmbedding:
      listByBookIdWithoutEmbedding as unknown as ChunkRepository['listByBookIdWithoutEmbedding'],
    updateEmbeddingsBatch,
    countByBookId: vi.fn(async () => chunks.length),
    countByBookIdWithoutEmbedding,
    findById: vi.fn(async () => null),
  }
  return {
    repo,
    countByBookIdWithoutEmbedding,
    listByBookIdWithoutEmbedding,
    updateEmbeddingsBatch,
    updates,
  }
}

interface EmbeddingProviderMock {
  provider: EmbeddingProvider
  embed: ReturnType<typeof vi.fn>
}

function buildVector(seed: number): number[] {
  return Array.from({ length: EMBED_DIMS }, (_, i) => (seed + i) / EMBED_DIMS)
}

function makeProvider(opts: { failBatchIndex?: number } = {}): EmbeddingProviderMock {
  let callIndex = 0
  const embed = vi.fn(async (texts: readonly string[]): Promise<number[][]> => {
    const i = callIndex++
    if (opts.failBatchIndex !== undefined && i === opts.failBatchIndex) {
      throw new EmbedError('OpenAI 503 upstream timeout', { retryable: true })
    }
    return texts.map((_, idx) => buildVector(i * 1000 + idx))
  })
  const provider: EmbeddingProvider = {
    dimensions: 1536,
    modelName: 'text-embedding-3-small',
    embed,
  }
  return { provider, embed }
}

describe('embedStage — happy path: 150 chunks → two batches', () => {
  it('embeds in two batches (100 + 50) and writes back per batch', async () => {
    const chunks = makeChunks(150)
    const book = makeBook()
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const chunkRepo = makeChunkRepo(chunks)
    const embedding = makeProvider()

    await embedStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chunkRepo: chunkRepo.repo,
        embeddingProvider: embedding.provider,
      },
    )

    expect(embedding.embed).toHaveBeenCalledTimes(2)
    expect((embedding.embed.mock.calls[0]?.[0] as readonly string[]).length).toBe(100)
    expect((embedding.embed.mock.calls[1]?.[0] as readonly string[]).length).toBe(50)

    expect(chunkRepo.updateEmbeddingsBatch).toHaveBeenCalledTimes(2)
    expect(chunkRepo.updates[0]?.length).toBe(100)
    expect(chunkRepo.updates[1]?.length).toBe(50)
    expect(chunkRepo.updates[0]?.[0]?.id).toBe(chunks[0]?.id)
    expect(chunkRepo.updates[1]?.[0]?.id).toBe(chunks[100]?.id)

    expect(pgboss.send).toHaveBeenCalledWith('ingestion.index', { bookId: BOOK_ID })
  })
})

describe('embedStage — failure path: provider throws on second batch', () => {
  it('preserves the first batch updates, marks the book failed, rethrows EmbedError', async () => {
    const chunks = makeChunks(150)
    const book = makeBook()
    const { db, updates } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger, logs } = makeLogger()
    const chunkRepo = makeChunkRepo(chunks)
    const embedding = makeProvider({ failBatchIndex: 1 })

    await expect(
      embedStage(
        { bookId: BOOK_ID },
        {
          db,
          logger,
          pgboss,
          chunkRepo: chunkRepo.repo,
          embeddingProvider: embedding.provider,
        },
      ),
    ).rejects.toBeInstanceOf(EmbedError)

    // First batch's writes survive — they were already committed via updateEmbeddingsBatch.
    expect(chunkRepo.updateEmbeddingsBatch).toHaveBeenCalledTimes(1)
    expect(chunkRepo.updates[0]?.length).toBe(100)

    expect(pgboss.send).not.toHaveBeenCalled()
    const failureUpdate = updates.at(-1)?.set
    expect(failureUpdate?.ingestionStatus).toBe('failed')
    expect(failureUpdate?.ingestionError).toContain('ingestion-embed-failed')
    expect(logs.find((l) => l.level === 'error')?.meta).toMatchObject({
      stage: 'embed',
      error_slug: 'ingestion-embed-failed',
    })
  })
})

describe('embedStage — resume after partial embed', () => {
  it('processes the remaining unembedded chunks and enqueues ingestion.index', async () => {
    // 50 chunks remaining (the unembedded tail of an earlier 150-chunk book).
    const chunks = makeChunks(50)
    const book = makeBook({ ingestionStatus: 'failed', ingestionLastStage: 'embed' })
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const chunkRepo = makeChunkRepo(chunks)
    const embedding = makeProvider()

    await embedStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chunkRepo: chunkRepo.repo,
        embeddingProvider: embedding.provider,
      },
    )

    expect(embedding.embed).toHaveBeenCalledTimes(1)
    expect(chunkRepo.updateEmbeddingsBatch).toHaveBeenCalledTimes(1)
    expect(chunkRepo.updates[0]?.length).toBe(50)
    expect(pgboss.send).toHaveBeenCalledWith('ingestion.index', { bookId: BOOK_ID })
  })
})

describe('embedStage — zero chunks (degenerate but tolerated)', () => {
  it('still enqueues ingestion.index without calling the provider', async () => {
    const book = makeBook()
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const chunkRepo = makeChunkRepo([])
    const embedding = makeProvider()

    await embedStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chunkRepo: chunkRepo.repo,
        embeddingProvider: embedding.provider,
      },
    )

    expect(embedding.embed).not.toHaveBeenCalled()
    expect(chunkRepo.updateEmbeddingsBatch).not.toHaveBeenCalled()
    expect(pgboss.send).toHaveBeenCalledWith('ingestion.index', { bookId: BOOK_ID })
  })
})

describe('embedStage — progress reporting', () => {
  it('emits 50% progress after the first of two batches and 100% at the end', async () => {
    const chunks = makeChunks(150)
    const book = makeBook()
    const { db, updates } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const chunkRepo = makeChunkRepo(chunks)
    const embedding = makeProvider()

    await embedStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chunkRepo: chunkRepo.repo,
        embeddingProvider: embedding.provider,
      },
    )

    const progressValues = updates
      .map((u) => u.set.ingestionProgress)
      .filter((p): p is number => typeof p === 'number')
    // initial 0, mid-pipeline 50 (after first of two batches), final 100.
    expect(progressValues).toContain(0)
    expect(progressValues).toContain(50)
    expect(progressValues).toContain(100)
    expect(updates[0]?.set.ingestionStatus).toBe('embedding')
  })
})

describe('embedStage — non-EmbedError gets wrapped', () => {
  it('wraps a generic error into EmbedError with the right slug', async () => {
    const chunks = makeChunks(50)
    const book = makeBook()
    const { db, updates } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const chunkRepo = makeChunkRepo(chunks)
    chunkRepo.updateEmbeddingsBatch.mockRejectedValueOnce(new Error('connection lost'))
    const embedding = makeProvider()

    await expect(
      embedStage(
        { bookId: BOOK_ID },
        {
          db,
          logger,
          pgboss,
          chunkRepo: chunkRepo.repo,
          embeddingProvider: embedding.provider,
        },
      ),
    ).rejects.toBeInstanceOf(EmbedError)

    expect(pgboss.send).not.toHaveBeenCalled()
    const failureUpdate = updates.at(-1)?.set
    expect(failureUpdate?.ingestionStatus).toBe('failed')
    expect(failureUpdate?.ingestionError).toContain('ingestion-embed-failed')
  })
})
