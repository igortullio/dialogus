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
 *
 * **Security (US3):** the admin plugin registers its own management endpoints
 * under `/admin/*` (`set-role`, `ban-user`, `remove-user`, `create-user`, …).
 * Those bypass the app's last-admin guard (FR-017) and invite-only allowlist
 * (FR-014/FR-016), so they are blocked here — member access control and account
 * creation must flow through the guarded `/api/admin/*` + accept-invite routes.
 * The plugin's role/ban columns and sign-in enforcement are unaffected (those
 * live in the core session flow, not under `/admin/*`).
 */
export function createAuthRoute(auth: Auth): Hono {
  const app = new Hono()
  app.on(['POST', 'GET'], '/admin/*', (c) => c.json({ error: 'not_found' }, 404))
  app.on(['POST', 'GET'], '/*', (c) => auth.handler(c.req.raw))
  return app
}
