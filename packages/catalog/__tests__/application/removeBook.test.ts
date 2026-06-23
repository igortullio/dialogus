import { describe, expect, it, vi } from 'vitest'
import { removeBook } from '../../src/application/removeBook'
import type { LibraryEntryRepository } from '../../src/domain/libraryEntry/LibraryEntryRepository.port'

const USER = 'user-1'

function fakeLibraryRepo(softRemove: boolean): LibraryEntryRepository {
  return {
    upsertMembership: vi.fn(),
    isActiveMember: vi.fn(),
    softRemove: vi.fn(async () => softRemove),
    restore: vi.fn(),
    listForUser: vi.fn(),
    countInFlight: vi.fn(),
  }
}

describe('removeBook', () => {
  it('soft-removes the membership when the user actively has the book', async () => {
    const libraryRepo = fakeLibraryRepo(true)

    await removeBook({ libraryRepo }, USER, 'uuid-1')

    expect(libraryRepo.softRemove).toHaveBeenCalledWith(USER, 'uuid-1')
  })

  it('throws BookNotFoundError when there is no active membership to remove', async () => {
    const libraryRepo = fakeLibraryRepo(false)

    await expect(removeBook({ libraryRepo }, USER, 'missing-uuid')).rejects.toMatchObject({
      code: 'BOOK_NOT_FOUND',
    })
    expect(libraryRepo.softRemove).toHaveBeenCalledWith(USER, 'missing-uuid')
  })
})
