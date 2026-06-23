import { Hono } from 'hono'
import type { Auth } from '../../auth/auth'

/**
 * Mounts the Better Auth handler as a catch-all. Mounted at `/api/auth`, a
 * request to `/api/auth/sign-in/email` reaches this app as `/*` and is handed
 * the original request (full URL preserved) so Better Auth routes it.
 *
 * Better Auth returns its own Response objects and never throws into the Hono
 * chain, so the global problem middleware passes them through untouched — this
 * group is intentionally exempt from the RFC 9457 contract (deviation E1).
 */
export function createAuthRoute(auth: Auth): Hono {
  const app = new Hono()
  app.on(['POST', 'GET'], '/*', (c) => auth.handler(c.req.raw))
  return app
}
