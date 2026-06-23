import type { Auth } from '../../src/infrastructure/auth/auth'

/**
 * A stub Better Auth instance whose `api.getSession` always resolves to a fixed
 * user, regardless of request headers. This is the single test-auth pattern for
 * the library route (see specs/001-multi-user-auth HANDOFF Step 3):
 *
 * - Unit route tests pass any `userId` — no cookie/sign-in dance needed.
 * - Testcontainers integration tests pass a REAL `userId` (one that exists in the
 *   `user` table, e.g. via `createTestUser`), so `library_entries` FK inserts
 *   succeed and cross-user isolation can be exercised by swapping `userId`.
 */
export function fakeAuth(userId: string, role: 'admin' | 'member' = 'member'): Auth {
  return {
    api: {
      getSession: async () => ({ user: { id: userId, role } }),
    },
  } as unknown as Auth
}
