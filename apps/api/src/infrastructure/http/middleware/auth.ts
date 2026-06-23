import { ForbiddenError, UnauthorizedError } from '@dialogus/shared/errors'
import type { MiddlewareHandler } from 'hono'
import type { Auth } from '../../auth/auth'

/** Hono context variables populated by `createSessionMiddleware`. */
export interface AuthVariables {
  userId: string | null
  userRole: string | null
}

/**
 * Reads the Better Auth session (from the request cookies) and exposes the
 * authenticated user id + role on the Hono context. Always calls `next()` —
 * gating is the job of `requireAuth` / `requireAdmin` so unauthenticated
 * requests can still reach public endpoints.
 */
export function createSessionMiddleware(
  auth: Auth,
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const result = await auth.api.getSession({ headers: c.req.raw.headers })
    c.set('userId', result?.user.id ?? null)
    c.set('userRole', (result?.user as { role?: string } | undefined)?.role ?? null)
    await next()
  }
}

/** Rejects requests without an authenticated session (FR-001). */
export function requireAuth(): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    if (!c.get('userId')) throw new UnauthorizedError()
    await next()
  }
}

/** Rejects requests that are not from an `admin` user (FR-017). */
export function requireAdmin(): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    if (!c.get('userId')) throw new UnauthorizedError()
    if (c.get('userRole') !== 'admin') throw new ForbiddenError()
    await next()
  }
}
