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

/**
 * A stub Better Auth instance that resolves the session from an `x-test-user`
 * request header, so a single booted app can act as multiple users (one request
 * per user) — used by the cross-user isolation integration tests. An absent or
 * unknown header resolves to `null` (exercises the 401 path). Each id must exist
 * in the `user` table (FK from `library_entries`), so seed via `createTestUser`.
 */
export function headerAuth(users: Record<string, { id: string; role?: 'admin' | 'member' }>): Auth {
  return {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get('x-test-user')
        const user = id ? users[id] : undefined
        return user ? { user: { id: user.id, role: user.role ?? 'member' } } : null
      },
    },
  } as unknown as Auth
}
