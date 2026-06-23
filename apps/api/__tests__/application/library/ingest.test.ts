import type { LibraryEntryRepository } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { describe, expect, it, vi } from 'vitest'
import { ingestBook } from '../../../src/application/library/ingest'

const BOOK_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = 'user-1'

function buildDb(book: { id: string; ingestionStatus: string } | null) {
  const where = vi.fn().mockResolvedValue(undefined)
  const set = vi.fn().mockReturnValue({ where })
  const update = vi.fn().mockReturnValue({ set })
  const findFirst = vi.fn().mockResolvedValue(book)
  const db = {
    query: { books: { findFirst } },
    update,
  } as unknown as Database
  return { db, update, set, where }
}

function fakeLibraryRepo(overrides: Partial<LibraryEntryRepository> = {}): LibraryEntryRepository {
  return {
    upsertMembership: vi.fn(async () => undefined),
    isActiveMember: vi.fn(async () => true),
    softRemove: vi.fn(async () => true),
    restore: vi.fn(async () => true),
    listForUser: vi.fn(async () => ({ books: [], nextCursor: null, total: 0 })),
    countInFlight: vi.fn(async () => 0),
    ...overrides,
  }
}

describe('ingestBook', () => {
  it('persists ingestionStatus="downloading" synchronously when enqueuing a discovered book', async () => {
    const { db, set } = buildDb({ id: BOOK_ID, ingestionStatus: 'discovered' })
    const enqueueImpl = vi.fn().mockResolvedValue('job-1')

    const result = await ingestBook(
      {
        db,
        libraryRepo: fakeLibraryRepo(),
        concurrencyLimit: 2,
        enqueueDeps: { databaseUrl: 'postgres://test' },
        enqueueImpl,
      },
      USER_ID,
      BOOK_ID,
    )

    expect(result).toMatchObject({ status: 'downloading', stage: 'download', job_id: 'job-1' })
    expect(enqueueImpl).toHaveBeenCalledWith(
      { databaseUrl: 'postgres://test' },
      'ingestion.download',
      { bookId: BOOK_ID },
      { singletonKey: `ingest-${BOOK_ID}` },
    )
    // The fix: the DB row must flip to "downloading" right away so the UI shows
    // progress immediately instead of sitting on "Aguardando ingestão" until the
    // worker (and the slow background poll) catch up.
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ ingestionStatus: 'downloading' }))
  })

  it('does not touch the book row when the book is not discovered', async () => {
    const { db, update } = buildDb({ id: BOOK_ID, ingestionStatus: 'downloading' })
    const enqueueImpl = vi.fn().mockResolvedValue('job-1')

    await expect(
      ingestBook(
        {
          db,
          libraryRepo: fakeLibraryRepo(),
          concurrencyLimit: 2,
          enqueueDeps: { databaseUrl: 'postgres://test' },
          enqueueImpl,
        },
        USER_ID,
        BOOK_ID,
      ),
    ).rejects.toThrow()

    expect(enqueueImpl).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects with the concurrency-limit error and does not enqueue when at the cap', async () => {
    const { db, update } = buildDb({ id: BOOK_ID, ingestionStatus: 'discovered' })
    const enqueueImpl = vi.fn().mockResolvedValue('job-1')

    await expect(
      ingestBook(
        {
          db,
          libraryRepo: fakeLibraryRepo({ countInFlight: vi.fn(async () => 2) }),
          concurrencyLimit: 2,
          enqueueDeps: { databaseUrl: 'postgres://test' },
          enqueueImpl,
        },
        USER_ID,
        BOOK_ID,
      ),
    ).rejects.toMatchObject({ code: 'INGESTION_CONCURRENCY_LIMIT' })

    expect(enqueueImpl).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects with book-not-found for a non-member without reading the book row', async () => {
    const { db, update } = buildDb({ id: BOOK_ID, ingestionStatus: 'discovered' })
    const enqueueImpl = vi.fn().mockResolvedValue('job-1')

    await expect(
      ingestBook(
        {
          db,
          libraryRepo: fakeLibraryRepo({ isActiveMember: vi.fn(async () => false) }),
          concurrencyLimit: 2,
          enqueueDeps: { databaseUrl: 'postgres://test' },
          enqueueImpl,
        },
        USER_ID,
        BOOK_ID,
      ),
    ).rejects.toMatchObject({ code: 'BOOK_NOT_FOUND' })

    expect(enqueueImpl).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
