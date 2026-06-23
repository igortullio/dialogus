import type { LibraryEntryRepository } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { describe, expect, it, vi } from 'vitest'
import { getSpoilerCaps, setSpoilerCap } from '../../../src/application/preferences/spoilerCaps'

const USER_ID = 'user-1'
const BOOK_A = '00000000-0000-4000-8000-00000000000a'
const BOOK_B = '00000000-0000-4000-8000-00000000000b'

function fakeLibraryRepo(isActiveMember: boolean): LibraryEntryRepository {
  return {
    upsertMembership: vi.fn(),
    isActiveMember: vi.fn(async () => isActiveMember),
    softRemove: vi.fn(),
    restore: vi.fn(),
    listForUser: vi.fn(),
    countInFlight: vi.fn(),
  }
}

function selectDb(rows: Array<{ bookId: string; cap: number | null }>): Database {
  const where = vi.fn(async () => rows)
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))
  return { select } as unknown as Database
}

function insertDb(): {
  db: Database
  onConflictDoUpdate: ReturnType<typeof vi.fn>
  values: ReturnType<typeof vi.fn>
} {
  const onConflictDoUpdate = vi.fn(async () => undefined)
  const values = vi.fn(() => ({ onConflictDoUpdate }))
  const insert = vi.fn(() => ({ values }))
  return { db: { insert } as unknown as Database, onConflictDoUpdate, values }
}

describe('getSpoilerCaps', () => {
  it('returns null for requested books with no stored preference and the stored cap otherwise', async () => {
    const db = selectDb([{ bookId: BOOK_A, cap: 5 }])

    const caps = await getSpoilerCaps({ db, libraryRepo: fakeLibraryRepo(true) }, USER_ID, [
      BOOK_A,
      BOOK_B,
    ])

    expect(caps).toEqual({ [BOOK_A]: 5, [BOOK_B]: null })
  })

  it('returns an empty map and does not query when no book ids are requested', async () => {
    const db = selectDb([])

    const caps = await getSpoilerCaps({ db, libraryRepo: fakeLibraryRepo(true) }, USER_ID, [])

    expect(caps).toEqual({})
    expect(db.select).not.toHaveBeenCalled()
  })

  it('preserves a stored cap of 0 (hide everything) as distinct from null (no cap)', async () => {
    const db = selectDb([{ bookId: BOOK_A, cap: 0 }])

    const caps = await getSpoilerCaps({ db, libraryRepo: fakeLibraryRepo(true) }, USER_ID, [BOOK_A])

    expect(caps[BOOK_A]).toBe(0)
  })
})

describe('setSpoilerCap', () => {
  it('upserts the cap for an active member and returns it', async () => {
    const { db, values } = insertDb()
    const libraryRepo = fakeLibraryRepo(true)

    const result = await setSpoilerCap({ db, libraryRepo }, USER_ID, BOOK_A, 7)

    expect(libraryRepo.isActiveMember).toHaveBeenCalledWith(USER_ID, BOOK_A)
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, bookId: BOOK_A, spoilerCapChapter: 7 }),
    )
    expect(result).toEqual({ bookId: BOOK_A, spoilerCapChapter: 7 })
  })

  it('clears the cap when passed null', async () => {
    const { db, values } = insertDb()

    const result = await setSpoilerCap(
      { db, libraryRepo: fakeLibraryRepo(true) },
      USER_ID,
      BOOK_A,
      null,
    )

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ spoilerCapChapter: null }))
    expect(result.spoilerCapChapter).toBeNull()
  })

  it('throws BookNotFoundError for a non-member without writing', async () => {
    const { db, values } = insertDb()

    await expect(
      setSpoilerCap({ db, libraryRepo: fakeLibraryRepo(false) }, USER_ID, BOOK_A, 3),
    ).rejects.toMatchObject({ code: 'BOOK_NOT_FOUND' })

    expect(values).not.toHaveBeenCalled()
  })
})
