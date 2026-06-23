import { randomUUID } from 'node:crypto'
import {
  account,
  books,
  invitations,
  libraryEntries,
  securityEvents,
  session as sessionTable,
  userBookPreferences,
  user as userTable,
} from '@dialogus/db/schema'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteAccount } from '../../src/application/admin/members'
import type { UserThreadDeleter } from '../../src/application/admin/ports'
import { DrizzleAdminRepository } from '../../src/infrastructure/persistence/DrizzleAdminRepository'
import {
  addLibraryMembership,
  createTestUser,
  dockerAvailable,
  insertDiscoveredBook,
  type PostgresContext,
  startPostgres,
  stopPostgres,
} from './_helpers/setup'

function fakeThreads(): UserThreadDeleter & { deleted: string[] } {
  const deleted: string[] = []
  return {
    deleted,
    deleteThreadsForUser: vi.fn(async (id: string) => {
      deleted.push(id)
    }),
  }
}

describe.skipIf(!dockerAvailable)('account deletion cascade (FR-023, Testcontainers)', () => {
  let pg: PostgresContext
  let repo: DrizzleAdminRepository

  beforeAll(async () => {
    pg = await startPostgres()
    repo = new DrizzleAdminRepository(pg.db)
  }, 180_000)

  afterAll(async () => {
    if (pg) await stopPostgres(pg)
  })

  beforeEach(async () => {
    await pg.db.delete(securityEvents)
    await pg.db.delete(invitations)
    await pg.db.delete(userBookPreferences)
    await pg.db.delete(libraryEntries)
    await pg.db.delete(sessionTable)
    await pg.db.delete(account)
    await pg.db.delete(books)
    await pg.db.delete(userTable)
  })

  it('removes only the target user; the shared corpus and other users are untouched', async () => {
    const userA = await createTestUser(pg.db, { id: `a-${randomUUID()}`, role: 'member' })
    const userB = await createTestUser(pg.db, { id: `b-${randomUUID()}`, role: 'member' })
    const bookId = await insertDiscoveredBook(pg.db, { gutendexId: 7001 })

    // Both users reference the shared book; both have preferences + a session.
    await addLibraryMembership(pg.db, userA, bookId)
    await addLibraryMembership(pg.db, userB, bookId)
    await pg.db.insert(userBookPreferences).values([
      { userId: userA, bookId, spoilerCapChapter: 3 },
      { userId: userB, bookId, spoilerCapChapter: 5 },
    ])
    await pg.db.insert(sessionTable).values([
      {
        id: `s-${randomUUID()}`,
        userId: userA,
        token: `t-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
      {
        id: `s-${randomUUID()}`,
        userId: userB,
        token: `t-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    ])
    // A credential account (cascades) + an audit row and an invitation A sent
    // (both must SURVIVE with the user link anonymized to NULL, not be deleted).
    await pg.db.insert(account).values({
      id: `acc-${randomUUID()}`,
      userId: userA,
      accountId: userA,
      providerId: 'credential',
      password: 'hashed',
    })
    await pg.db
      .insert(securityEvents)
      .values({ userId: userA, email: 'a@test.local', eventType: 'sign_in' })
    const [invite] = await pg.db
      .insert(invitations)
      .values({
        email: 'invited-by-a@test.local',
        invitedBy: userA,
        status: 'pending',
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      .returning()
    if (!invite) throw new Error('failed to insert invitation')

    const threads = fakeThreads()
    await deleteAccount({ repo, threads }, userA)

    // A's Mastra threads were removed via the deleter (no DB cascade for them).
    expect(threads.deleted).toEqual([userA])

    // A is gone; the cascade removed A's per-user data.
    expect(await pg.db.select().from(userTable).where(eq(userTable.id, userA))).toHaveLength(0)
    expect(
      await pg.db.select().from(libraryEntries).where(eq(libraryEntries.userId, userA)),
    ).toHaveLength(0)
    expect(
      await pg.db.select().from(userBookPreferences).where(eq(userBookPreferences.userId, userA)),
    ).toHaveLength(0)
    expect(
      await pg.db.select().from(sessionTable).where(eq(sessionTable.userId, userA)),
    ).toHaveLength(0)
    // A's credential account cascaded away.
    expect(await pg.db.select().from(account).where(eq(account.userId, userA))).toHaveLength(0)

    // A's audit row is anonymized (kept, user_id → NULL), not deleted.
    const events = await pg.db.select().from(securityEvents)
    expect(events).toHaveLength(1)
    expect(events[0]?.userId).toBeNull()
    expect(events[0]?.email).toBe('a@test.local')

    // The invitation A sent survives with invited_by anonymized to NULL.
    const survivingInvite = await pg.db
      .select()
      .from(invitations)
      .where(eq(invitations.id, invite.id))
    expect(survivingInvite).toHaveLength(1)
    expect(survivingInvite[0]?.invitedBy).toBeNull()

    // The shared book survives; B keeps everything.
    expect(await pg.db.select().from(books).where(eq(books.id, bookId))).toHaveLength(1)
    expect(await pg.db.select().from(userTable).where(eq(userTable.id, userB))).toHaveLength(1)
    expect(
      await pg.db.select().from(libraryEntries).where(eq(libraryEntries.userId, userB)),
    ).toHaveLength(1)
    expect(
      await pg.db.select().from(userBookPreferences).where(eq(userBookPreferences.userId, userB)),
    ).toHaveLength(1)
    expect(
      await pg.db.select().from(sessionTable).where(eq(sessionTable.userId, userB)),
    ).toHaveLength(1)
  })

  it('refuses to delete the only administrator (last-admin guard, FR-017)', async () => {
    const onlyAdmin = await createTestUser(pg.db, { id: `admin-${randomUUID()}`, role: 'admin' })
    const threads = fakeThreads()

    await expect(deleteAccount({ repo, threads }, onlyAdmin)).rejects.toMatchObject({
      code: 'LAST_ADMIN',
    })

    // Nothing was deleted.
    expect(threads.deleted).toHaveLength(0)
    expect(await pg.db.select().from(userTable).where(eq(userTable.id, onlyAdmin))).toHaveLength(1)
  })
})
