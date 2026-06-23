import { session as sessionTable, verification } from '@dialogus/db/schema'
import type { DialogusEnv } from '@dialogus/shared/config'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Auth, createAuth } from '../../src/infrastructure/auth/auth'
import { DrizzleAdminRepository } from '../../src/infrastructure/persistence/DrizzleAdminRepository'
import {
  dockerAvailable,
  type PostgresContext,
  startPostgres,
  stopPostgres,
} from './_helpers/setup'

const testConfig = {
  NODE_ENV: 'test',
  BETTER_AUTH_SECRET: 'test-secret-at-least-32-chars-long-xx',
  NEXT_PUBLIC_API_URL: 'http://localhost:3001',
  APP_URL: 'http://localhost:3000',
  WEB_ORIGIN: 'http://localhost:3000',
  AUTH_TRUSTED_ORIGINS: '',
  SESSION_MAX_AGE_SECONDS: 60 * 60 * 24 * 7,
  AUTH_RATE_LIMIT_SIGNIN_MAX: 1000,
  LOG_LEVEL: 'silent',
} as unknown as DialogusEnv

/**
 * Captures the reset token Better Auth emits via `sendResetPassword`. The email
 * link is `${baseURL}/reset-password/<TOKEN>?callbackURL=...` (token is a path
 * segment), which the user's click redirects to `<callbackURL>?token=<TOKEN>`.
 */
function recordingEmail() {
  const links: string[] = []
  return {
    links,
    provider: {
      async send(input: { to: string; subject: string; html: string; text?: string }) {
        const content = `${input.html} ${input.text ?? ''}`
        const match =
          content.match(/[?&]token=([^&"'\s]+)/) ?? content.match(/\/reset-password\/([^?"'\s&]+)/)
        if (match) links.push(decodeURIComponent(match[1] as string))
      },
    },
  }
}

/** First `name=value` pair from a Set-Cookie header (the session cookie). */
function sessionCookie(setCookie: string | null): string {
  if (!setCookie) throw new Error('expected a Set-Cookie header from sign-in')
  return setCookie.split(';')[0] as string
}

describe.skipIf(!dockerAvailable)(
  'US4 session lifecycle + account recovery (Testcontainers)',
  () => {
    let pg: PostgresContext
    let auth: Auth
    let email: ReturnType<typeof recordingEmail>

    /** Seed an account with a password (admin role is allowlist-exempt). */
    async function seedUser(addr: string, password: string): Promise<string> {
      const ctx = await auth.$context
      const normalized = addr.trim().toLowerCase()
      const hashed = await ctx.password.hash(password)
      const created = await ctx.internalAdapter.createUser({
        email: normalized,
        name: 'Test User',
        emailVerified: true,
        role: 'admin',
      })
      await ctx.internalAdapter.createAccount({
        userId: created.id,
        providerId: 'credential',
        accountId: created.id,
        password: hashed,
      })
      return created.id
    }

    async function signIn(addr: string, password: string): Promise<string> {
      const res = await auth.api.signInEmail({
        body: { email: addr, password },
        asResponse: true,
      })
      return sessionCookie(res.headers.get('set-cookie'))
    }

    beforeAll(async () => {
      pg = await startPostgres()
      email = recordingEmail()
      auth = createAuth({
        db: pg.db,
        config: testConfig,
        emailProvider: email.provider,
        adminRepo: new DrizzleAdminRepository(pg.db),
      })
    }, 180_000)

    afterAll(async () => {
      if (pg) await stopPostgres(pg)
    })

    beforeEach(async () => {
      email.links.length = 0
      await pg.db.delete(verification)
      await pg.db.delete(sessionTable)
    })

    it('keeps independent sessions per device; signing out one leaves the other valid (FR-020)', async () => {
      await seedUser('multi@test.local', 'StrongPass123!')

      const deviceA = await signIn('multi@test.local', 'StrongPass123!')
      const deviceB = await signIn('multi@test.local', 'StrongPass123!')
      expect(deviceA).not.toBe(deviceB)

      // Two independent session rows.
      const rows = await pg.db.select().from(sessionTable)
      expect(rows).toHaveLength(2)

      // Sign out device A only.
      await auth.api.signOut({ headers: new Headers({ cookie: deviceA }) })

      const afterA = await auth.api.getSession({ headers: new Headers({ cookie: deviceA }) })
      const afterB = await auth.api.getSession({ headers: new Headers({ cookie: deviceB }) })
      expect(afterA).toBeNull()
      expect(afterB?.user.email).toBe('multi@test.local')
    })

    it('rejects a session past its expiry (FR-018)', async () => {
      await seedUser('expiry@test.local', 'StrongPass123!')
      const cookie = await signIn('expiry@test.local', 'StrongPass123!')

      // Valid right after sign-in.
      expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).not.toBeNull()

      // Force the (single) session row past its expiry.
      await pg.db.update(sessionTable).set({ expiresAt: new Date(Date.now() - 60_000) })

      const expired = await auth.api.getSession({ headers: new Headers({ cookie }) })
      expect(expired).toBeNull()
    })

    it('recovers access via a single-use, expiring reset token (FR-019)', async () => {
      await seedUser('reset@test.local', 'OldPass123!')

      await auth.api.requestPasswordReset({
        body: { email: 'reset@test.local', redirectTo: 'http://localhost:3000/reset-password' },
      })
      expect(email.links).toHaveLength(1)
      const token = email.links[0] as string

      // Reset succeeds; the new password works and the old one no longer does.
      await auth.api.resetPassword({ body: { token, newPassword: 'NewPass456!' } })

      const okNew = await auth.api.signInEmail({
        body: { email: 'reset@test.local', password: 'NewPass456!' },
        asResponse: true,
      })
      expect(okNew.status).toBeLessThan(400)
      await expect(
        auth.api.signInEmail({ body: { email: 'reset@test.local', password: 'OldPass123!' } }),
      ).rejects.toBeDefined()

      // The token is single-use: replaying it fails.
      await expect(
        auth.api.resetPassword({ body: { token, newPassword: 'Another789!' } }),
      ).rejects.toBeDefined()
    })

    it('rejects an expired reset token', async () => {
      await seedUser('latereset@test.local', 'OldPass123!')

      await auth.api.requestPasswordReset({
        body: { email: 'latereset@test.local', redirectTo: 'http://localhost:3000/reset-password' },
      })
      const token = email.links[0] as string

      // Expire the verification row backing the reset token.
      await pg.db.update(verification).set({ expiresAt: new Date(Date.now() - 60_000) })

      await expect(
        auth.api.resetPassword({ body: { token, newPassword: 'NewPass456!' } }),
      ).rejects.toBeDefined()
    })
  },
)
