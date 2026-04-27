import type { Database } from '@dialogus/db/client'
import { describe, expect, it, vi } from 'vitest'
import type { ChapterSummary } from '../../../src/domain/chapter_summary/ChapterSummary'
import { DrizzleChapterSummaryRepository } from '../../../src/infrastructure/persistence/DrizzleChapterSummaryRepository'
import type { ChapterSummaryRow } from '../../../src/infrastructure/persistence/mappers/ChapterSummaryMapper'

const fixedGenerated = new Date('2026-04-25T10:00:00.000Z')

function buildRow(overrides: Partial<ChapterSummaryRow> = {}): ChapterSummaryRow {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    chapterId: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
    bookId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
    summary: 'A short scholarly summary of the chapter.',
    tokenCount: 240,
    model: 'claude-haiku-4-5',
    generatedAt: fixedGenerated,
    ...overrides,
  }
}

function buildSummary(overrides: Partial<ChapterSummary> = {}): ChapterSummary {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    chapterId: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
    bookId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
    summary: 'A short scholarly summary of the chapter.',
    tokenCount: 240,
    model: 'claude-haiku-4-5',
    generatedAt: fixedGenerated,
    ...overrides,
  }
}

interface InsertChainCalls {
  values: ReturnType<typeof vi.fn>
  onConflictDoUpdate: ReturnType<typeof vi.fn>
  returning: ReturnType<typeof vi.fn>
}

interface SelectChainCalls {
  from: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  orderBy: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
}

interface MockDbCalls {
  insertChain: InsertChainCalls
  selectChain: SelectChainCalls
  insert: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
}

interface MockDbOptions {
  // Rows returned from insert().values().onConflictDoUpdate().returning().
  insertReturning?: ChapterSummaryRow[]
  // Final rows resolved after the select chain. The mock satisfies BOTH
  // chains used by the repo: limit-terminated (findByChapterId) and
  // orderBy-terminated (listMissingChapterIds).
  selectRows?: Array<ChapterSummaryRow | { id: string }>
}

function makeMockDb(opts: MockDbOptions = {}): { db: Database; calls: MockDbCalls } {
  const insertChain: InsertChainCalls = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(opts.insertReturning ?? []),
  }
  // listMissingChapterIds: select(...).from(...).where(...).orderBy(...).
  // The orderBy terminator must resolve to the row list.
  // findByChapterId: select(...).from(...).where(...).limit(...).
  // The limit terminator must resolve to the row list.
  const finalRows = opts.selectRows ?? []
  const selectChain: SelectChainCalls = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(finalRows),
    limit: vi.fn().mockResolvedValue(finalRows),
  }
  const insert = vi.fn().mockReturnValue(insertChain)
  // The repo also calls db.select inside notExists(), wrapping a sub-builder.
  // The outer builder is what gets awaited; the inner one is just an SQLWrapper
  // that the production code passes to notExists(), so returning the same chain
  // shape is enough — Drizzle's notExists only reads the SQLWrapper interface.
  const select = vi.fn().mockReturnValue(selectChain)
  const db = { insert, select } as unknown as Database
  return {
    db,
    calls: { insertChain, selectChain, insert, select },
  }
}

describe('DrizzleChapterSummaryRepository.save', () => {
  it('upserts via INSERT ... ON CONFLICT (chapter_id) DO UPDATE and returns the persisted row', async () => {
    const persisted = buildRow()
    const { db, calls } = makeMockDb({ insertReturning: [persisted] })
    const repo = new DrizzleChapterSummaryRepository(db)

    const result = await repo.save(buildSummary())

    expect(calls.insert).toHaveBeenCalledTimes(1)
    expect(calls.insertChain.values).toHaveBeenCalledTimes(1)
    expect(calls.insertChain.onConflictDoUpdate).toHaveBeenCalledTimes(1)
    const upsertArg = calls.insertChain.onConflictDoUpdate.mock.calls[0]?.[0] as
      | { target?: unknown; set?: Record<string, unknown> }
      | undefined
    expect(upsertArg?.target).toBeDefined()
    expect(upsertArg?.set).toBeDefined()
    expect(upsertArg?.set).not.toHaveProperty('id')
    expect(upsertArg?.set).toHaveProperty('summary')
    expect(upsertArg?.set).toHaveProperty('chapterId')
    expect(calls.insertChain.returning).toHaveBeenCalledTimes(1)
    expect(result.id).toBe(persisted.id)
    expect(result.summary).toBe(persisted.summary)
  })

  it('writes the regenerated summary when the existing chapter row hits the conflict target', async () => {
    const updated = buildRow({ summary: 'Regenerated summary text', tokenCount: 280 })
    const { db, calls } = makeMockDb({ insertReturning: [updated] })
    const repo = new DrizzleChapterSummaryRepository(db)

    const result = await repo.save(
      buildSummary({ summary: 'Regenerated summary text', tokenCount: 280 }),
    )

    expect(calls.insertChain.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          summary: 'Regenerated summary text',
          tokenCount: 280,
        }),
      }),
    )
    expect(result.summary).toBe('Regenerated summary text')
    expect(result.tokenCount).toBe(280)
  })

  it('throws when the database returns no row from the upsert', async () => {
    const { db } = makeMockDb({ insertReturning: [] })
    const repo = new DrizzleChapterSummaryRepository(db)
    await expect(repo.save(buildSummary())).rejects.toThrow(/no row/)
  })
})

describe('DrizzleChapterSummaryRepository.findByChapterId', () => {
  it('returns the mapped domain entity when the row is present', async () => {
    const row = buildRow()
    const { db, calls } = makeMockDb({ selectRows: [row] })
    const repo = new DrizzleChapterSummaryRepository(db)

    const result = await repo.findByChapterId(row.chapterId)

    expect(calls.select).toHaveBeenCalled()
    expect(calls.selectChain.from).toHaveBeenCalled()
    expect(calls.selectChain.where).toHaveBeenCalled()
    expect(calls.selectChain.limit).toHaveBeenCalledWith(1)
    expect(result).not.toBeNull()
    expect(result?.id).toBe(row.id)
    expect(result?.summary).toBe(row.summary)
    expect(result?.model).toBe(row.model)
    expect(result?.generatedAt).toEqual(fixedGenerated)
  })

  it('returns null when no row matches the chapter id', async () => {
    const { db } = makeMockDb({ selectRows: [] })
    const repo = new DrizzleChapterSummaryRepository(db)
    const result = await repo.findByChapterId('cccccccc-cccc-4ccc-cccc-cccccccccccc')
    expect(result).toBeNull()
  })
})

describe('DrizzleChapterSummaryRepository.listMissingChapterIds', () => {
  it('returns chapter ids from chapters that have no matching chapter_summaries row', async () => {
    const rows = [{ id: 'chap-1' }, { id: 'chap-2' }]
    const { db, calls } = makeMockDb({ selectRows: rows })
    const repo = new DrizzleChapterSummaryRepository(db)

    const ids = await repo.listMissingChapterIds('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')

    // Single round-trip: exactly one outer terminator awaited (orderBy).
    // The inner select inside notExists() is just an SQLWrapper, not an
    // awaited query — it shares the mocked select chain because the test
    // double does not distinguish nested builders.
    expect(calls.selectChain.orderBy).toHaveBeenCalledTimes(1)
    expect(ids).toEqual(['chap-1', 'chap-2'])
  })

  it('returns an empty array when every chapter already has a summary', async () => {
    const { db } = makeMockDb({ selectRows: [] })
    const repo = new DrizzleChapterSummaryRepository(db)
    const ids = await repo.listMissingChapterIds('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
    expect(ids).toEqual([])
  })
})

describe('ChapterSummaryMapper round-trip', () => {
  it('toDomain(toPersistence(entity)) reproduces the entity for sample input', async () => {
    const entity = buildSummary()
    const { toDomain, toPersistence } = await import(
      '../../../src/infrastructure/persistence/mappers/ChapterSummaryMapper'
    )
    const row = toPersistence(entity) as ChapterSummaryRow
    const back = toDomain(row)
    expect(back).toEqual(entity)
  })
})
