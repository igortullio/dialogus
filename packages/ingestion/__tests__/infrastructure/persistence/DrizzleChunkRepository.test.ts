import type { Database } from '@dialogus/db/client'
import { describe, expect, it, vi } from 'vitest'
import type { Chunk } from '../../../src/domain/chunk/Chunk'
import { DrizzleChunkRepository } from '../../../src/infrastructure/persistence/DrizzleChunkRepository'
import type { ChunkRow } from '../../../src/infrastructure/persistence/mappers/ChunkMapper'

const fixedCreated = new Date('2026-04-25T10:00:00.000Z')
const EMBED_DIMS = 1536

function buildEmbedding(seed = 0.1): number[] {
  return Array.from({ length: EMBED_DIMS }, (_, i) => seed + i / EMBED_DIMS)
}

function buildRow(overrides: Partial<ChunkRow> = {}): ChunkRow {
  return {
    id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
    bookId: 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1',
    chapterId: 'c3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b2',
    ordinal: 0,
    text: 'a chunk',
    tokenCount: 768,
    startChar: 0,
    endChar: 4096,
    embedding: null,
    createdAt: fixedCreated,
    ...overrides,
  }
}

function buildChunk(overrides: Partial<Chunk> = {}): Chunk {
  return {
    id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
    bookId: 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1',
    chapterId: 'c3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b2',
    ordinal: 0,
    text: 'a chunk',
    tokenCount: 768,
    startChar: 0,
    endChar: 4096,
    embedding: null,
    createdAt: fixedCreated,
    ...overrides,
  }
}

interface MockDbCalls {
  insertChain: {
    values: ReturnType<typeof vi.fn>
    onConflictDoNothing: ReturnType<typeof vi.fn>
  }
  selectChain: {
    from: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    orderBy: ReturnType<typeof vi.fn>
    limit: ReturnType<typeof vi.fn>
  }
  countChain: {
    from: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
  }
  query: {
    chunks: {
      findFirst: ReturnType<typeof vi.fn>
    }
  }
  insert: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  execute: ReturnType<typeof vi.fn>
}

interface MockDbOptions {
  selectRows?: ChunkRow[]
  selectBatches?: ChunkRow[][]
  countRow?: { count: number } | undefined
  findFirstResult?: ChunkRow | undefined
}

function makeMockDb(opts: MockDbOptions = {}): { db: Database; calls: MockDbCalls } {
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  }
  // limit() is awaited - it returns rows. To support multi-batch streaming, queue successive batches.
  const limitFn = vi.fn()
  if (opts.selectBatches) {
    for (const batch of opts.selectBatches) {
      limitFn.mockResolvedValueOnce(batch)
    }
    limitFn.mockResolvedValue([])
  } else {
    limitFn.mockResolvedValue(opts.selectRows ?? [])
  }
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    // orderBy() in real Drizzle returns a query builder that is itself awaitable AND chainable.
    // We mock that by returning a native Promise (resolves to rows for the listByBookId path)
    // with a .limit() method bolted on (used by the streaming path).
    orderBy: vi.fn(),
    limit: limitFn,
  }
  const orderByResult = Object.assign(Promise.resolve(opts.selectRows ?? []), {
    limit: limitFn,
  })
  selectChain.orderBy.mockReturnValue(orderByResult)
  const countChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(opts.countRow ? [opts.countRow] : []),
  }
  const query = {
    chunks: {
      findFirst: vi.fn().mockResolvedValue(opts.findFirstResult),
    },
  }
  const select = vi.fn((...args: unknown[]) => (args.length === 0 ? selectChain : countChain))
  const insert = vi.fn().mockReturnValue(insertChain)
  const execute = vi.fn().mockResolvedValue(undefined)
  const calls: MockDbCalls = {
    insertChain,
    selectChain,
    countChain,
    query,
    insert,
    select,
    execute,
  }
  const db = {
    insert,
    select,
    execute,
    query,
  } as unknown as Database
  return { db, calls }
}

describe('DrizzleChunkRepository.saveMany', () => {
  it('issues a single INSERT ... ON CONFLICT (book_id, chapter_id, ordinal) DO NOTHING for the batch', async () => {
    const { db, calls } = makeMockDb()
    const repo = new DrizzleChunkRepository(db)
    await repo.saveMany([buildChunk(), buildChunk({ ordinal: 1, id: 'other' })])
    expect(calls.insert).toHaveBeenCalledTimes(1)
    expect(calls.insertChain.values).toHaveBeenCalledTimes(1)
    expect(calls.insertChain.onConflictDoNothing).toHaveBeenCalledTimes(1)
  })

  it('skips the INSERT entirely on empty input', async () => {
    const { db, calls } = makeMockDb()
    const repo = new DrizzleChunkRepository(db)
    await repo.saveMany([])
    expect(calls.insert).not.toHaveBeenCalled()
  })
})

describe('DrizzleChunkRepository.listByBookId', () => {
  it('orders by chapter_id ASC then ordinal ASC and maps the rows to domain entities', async () => {
    const rows = [
      buildRow({ chapterId: 'c1', ordinal: 0 }),
      buildRow({ chapterId: 'c1', ordinal: 1, id: 'b' }),
    ]
    const { db, calls } = makeMockDb({ selectRows: rows })
    const repo = new DrizzleChunkRepository(db)
    const result = await repo.listByBookId('b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1')
    expect(calls.selectChain.from).toHaveBeenCalledTimes(1)
    expect(calls.selectChain.orderBy).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(2)
  })
})

describe('DrizzleChunkRepository.listByBookIdWithoutEmbedding', () => {
  it('returns an async iterator (not a plain Array)', () => {
    const { db } = makeMockDb({ selectBatches: [[]] })
    const repo = new DrizzleChunkRepository(db)
    const iter = repo.listByBookIdWithoutEmbedding('b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1')
    expect(Array.isArray(iter)).toBe(false)
    expect(typeof (iter as AsyncIterable<unknown>)[Symbol.asyncIterator]).toBe('function')
  })

  it('streams chunks one at a time across multiple internal batches (keyset pagination)', async () => {
    // Build a partial first batch so the loop doesn't keep paginating after one iteration.
    const firstBatch = [buildRow({ id: 'r1', embedding: null })]
    const { db, calls } = makeMockDb({ selectBatches: [firstBatch] })
    const repo = new DrizzleChunkRepository(db)
    const collected: Chunk[] = []
    for await (const chunk of repo.listByBookIdWithoutEmbedding(
      'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1',
    )) {
      collected.push(chunk)
    }
    expect(collected).toHaveLength(1)
    expect(collected[0]?.id).toBe('r1')
    expect(collected[0]?.embedding).toBeNull()
    // limit was called at least once with the streaming batch size.
    expect(calls.selectChain.limit).toHaveBeenCalled()
  })

  it('terminates cleanly when the first batch comes back empty', async () => {
    const { db } = makeMockDb({ selectBatches: [[]] })
    const repo = new DrizzleChunkRepository(db)
    const collected: Chunk[] = []
    for await (const chunk of repo.listByBookIdWithoutEmbedding('book-id')) {
      collected.push(chunk)
    }
    expect(collected).toHaveLength(0)
  })
})

describe('DrizzleChunkRepository.updateEmbeddingsBatch', () => {
  it('issues exactly one UPDATE statement on mocked Drizzle for the batch', async () => {
    const { db, calls } = makeMockDb()
    const repo = new DrizzleChunkRepository(db)
    await repo.updateEmbeddingsBatch([
      { id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0', embedding: buildEmbedding(0.1) },
      { id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1', embedding: buildEmbedding(0.2) },
      { id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b2', embedding: buildEmbedding(0.3) },
    ])
    expect(calls.execute).toHaveBeenCalledTimes(1)
  })

  it('skips execute() entirely on empty input', async () => {
    const { db, calls } = makeMockDb()
    const repo = new DrizzleChunkRepository(db)
    await repo.updateEmbeddingsBatch([])
    expect(calls.execute).not.toHaveBeenCalled()
  })
})

describe('DrizzleChunkRepository.countByBookId', () => {
  it('returns the mocked count value', async () => {
    const { db } = makeMockDb({ countRow: { count: 4096 } })
    const repo = new DrizzleChunkRepository(db)
    expect(await repo.countByBookId('book-id')).toBe(4096)
  })

  it('returns 0 when the count row is missing', async () => {
    const { db } = makeMockDb({ countRow: undefined })
    const repo = new DrizzleChunkRepository(db)
    expect(await repo.countByBookId('book-id')).toBe(0)
  })
})

describe('DrizzleChunkRepository.countByBookIdWithoutEmbedding', () => {
  it('returns the mocked count value', async () => {
    const { db } = makeMockDb({ countRow: { count: 42 } })
    const repo = new DrizzleChunkRepository(db)
    expect(await repo.countByBookIdWithoutEmbedding('book-id')).toBe(42)
  })

  it('returns 0 when the count row is missing', async () => {
    const { db } = makeMockDb({ countRow: undefined })
    const repo = new DrizzleChunkRepository(db)
    expect(await repo.countByBookIdWithoutEmbedding('book-id')).toBe(0)
  })
})

describe('DrizzleChunkRepository.findById', () => {
  it('returns null when no row is found', async () => {
    const { db } = makeMockDb({ findFirstResult: undefined })
    const repo = new DrizzleChunkRepository(db)
    expect(await repo.findById('nope')).toBeNull()
  })

  it('returns a domain entity when the row is found', async () => {
    const row = buildRow({ embedding: buildEmbedding(0.5) })
    const { db } = makeMockDb({ findFirstResult: row })
    const repo = new DrizzleChunkRepository(db)
    const chunk = await repo.findById(row.id)
    expect(chunk?.id).toBe(row.id)
    expect(chunk?.embedding).toHaveLength(EMBED_DIMS)
  })
})
