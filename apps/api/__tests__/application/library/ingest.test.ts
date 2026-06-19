import type { Database } from '@dialogus/db'
import { describe, expect, it, vi } from 'vitest'
import { ingestBook } from '../../../src/application/library/ingest'

const BOOK_ID = '00000000-0000-4000-8000-000000000001'

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

describe('ingestBook', () => {
  it('persists ingestionStatus="downloading" synchronously when enqueuing a discovered book', async () => {
    const { db, set } = buildDb({ id: BOOK_ID, ingestionStatus: 'discovered' })
    const enqueueImpl = vi.fn().mockResolvedValue('job-1')

    const result = await ingestBook(
      { db, enqueueDeps: { databaseUrl: 'postgres://test' }, enqueueImpl },
      BOOK_ID,
    )

    expect(result).toMatchObject({ status: 'downloading', stage: 'download', job_id: 'job-1' })
    expect(enqueueImpl).toHaveBeenCalledWith(
      { databaseUrl: 'postgres://test' },
      'ingestion.download',
      { bookId: BOOK_ID },
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
      ingestBook({ db, enqueueDeps: { databaseUrl: 'postgres://test' }, enqueueImpl }, BOOK_ID),
    ).rejects.toThrow()

    expect(enqueueImpl).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
