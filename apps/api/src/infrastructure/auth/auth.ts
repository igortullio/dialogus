import type { Database } from '@dialogus/db'
import { account, rateLimit, session, user, verification } from '@dialogus/db/schema'
import type { DialogusEnv } from '@dialogus/shared/config'
import { type BetterAuthOptions, betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins'
import type { Logger } from 'pino'
import type { AdminRepository } from '../../application/admin/ports'
import type { EmailProvider } from '../email'
import { DrizzleAdminRepository } from '../persistence/DrizzleAdminRepository'
import { createAllowlistHooks } from './hooks'

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthConfigError'
  }
}

export interface CreateAuthDeps {
  readonly db: Database
  readonly config: DialogusEnv
  readonly emailProvider: EmailProvider
  readonly logger?: Pick<Logger, 'info' | 'warn'>
  /**
   * Persistence for the invite-only allowlist + audit hooks. Defaults to a
   * `DrizzleAdminRepository` over `db`; injectable so tests can observe the
   * recorded `security_events` / consumed invitations.
   */
  readonly adminRepo?: AdminRepository
}

const DEV_SECRET = 'dev-insecure-better-auth-secret-change-me'
const ONE_DAY_SECONDS = 60 * 60 * 24

function resolveSecret(config: DialogusEnv): string {
  if (config.BETTER_AUTH_SECRET && config.BETTER_AUTH_SECRET.length > 0) {
    return config.BETTER_AUTH_SECRET
  }
  if (config.NODE_ENV === 'production') {
    throw new AuthConfigError('BETTER_AUTH_SECRET is required in production')
  }
  return DEV_SECRET
}

function resolveTrustedOrigins(config: DialogusEnv): string[] {
  const extra = (config.AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
  return Array.from(new Set([config.APP_URL, config.WEB_ORIGIN, ...extra]))
}

/**
 * Builds the Better Auth instance for the Hono API. Owns identity, sessions,
 * email+password (invite-only via `disableSignUp` — the allowlist hook lands in
 * the onboarding story), admin roles + revocation, DB-backed rate limiting, and
 * password-reset emails routed through the shared `EmailProvider` port.
 *
 * Note: the Better Auth tables live in `packages/db` and are migrated via
 * drizzle-kit; this never runs Better Auth's own migrator.
 */
export function createAuth(deps: CreateAuthDeps) {
  const { db, config, emailProvider, logger } = deps
  const secret = resolveSecret(config)
  const adminRepo = deps.adminRepo ?? new DrizzleAdminRepository(db)

  return betterAuth({
    secret,
    baseURL: config.NEXT_PUBLIC_API_URL,
    trustedOrigins: resolveTrustedOrigins(config),
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification, rateLimit },
    }),
    emailAndPassword: {
      enabled: true,
      // Invite-only: the public `/sign-up/email` endpoint is disabled entirely.
      // Accounts are created server-side (owner seed + the accept-invite flow)
      // via `internalAdapter.createUser`, which still runs the `databaseHooks`
      // below — so the `user.create.before` allowlist hook gates every account
      // (FR-014/FR-016) and audits unauthorized attempts (FR-005).
      disableSignUp: true,
      sendResetPassword: async ({ user: target, url }) => {
        await emailProvider.send({
          to: target.email,
          subject: 'Redefinir sua senha — dIAlogus',
          html: `<p>Recebemos um pedido para redefinir sua senha.</p><p><a href="${url}">Redefinir senha</a></p><p>Se não foi você, ignore este e-mail.</p>`,
          text: `Redefina sua senha: ${url}`,
        })
      },
    },
    session: {
      // Sliding inactivity window (FR-018): the session lives `expiresIn`
      // seconds from its last refresh, and a request refreshes it once the
      // session is older than `updateAge`. An abandoned (inactive) device thus
      // expires after `SESSION_MAX_AGE_SECONDS`; an active one stays signed in.
      expiresIn: config.SESSION_MAX_AGE_SECONDS,
      updateAge: Math.min(config.SESSION_MAX_AGE_SECONDS, ONE_DAY_SECONDS),
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        // Sign-in back-off (FR-021).
        '/sign-in/email': { window: 60, max: config.AUTH_RATE_LIMIT_SIGNIN_MAX },
        // Account-recovery abuse (FR-019/FR-021): cap reset-link requests and
        // reset-confirm attempts so the flow can't be spammed or brute-forced.
        '/request-password-reset': { window: 3600, max: 5 },
        '/reset-password': { window: 3600, max: 10 },
      },
    },
    advanced: {
      // Single-origin deployment (the recommended prod model): web + API are
      // served under one origin behind a reverse proxy, so `SameSite=Lax` cookies
      // are sent on same-origin XHR. `Secure` is on in production (HTTPS); always
      // `HttpOnly`. The documented cross-origin fallback (web :3000 ↔ API :3001)
      // instead needs `SameSite=None; Secure` so credentialed cross-site fetches
      // carry the cookie — flip this here (and keep the explicit-origin CORS in
      // `index.ts`) if you deploy split-origin. See README → Deployment.
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: config.NODE_ENV === 'production',
        httpOnly: true,
      },
    },
    plugins: [admin({ defaultRole: 'member', adminRoles: ['admin'] })],
    // Invite-only allowlist gate + audit (US3). `internalAdapter.createUser`
    // (owner seed + accept-invite) runs these even though `/sign-up/email` is
    // disabled. See `infrastructure/auth/hooks.ts`.
    databaseHooks: createAllowlistHooks({ repo: adminRepo }) as BetterAuthOptions['databaseHooks'],
    onAPIError: {
      onError: (error) => {
        logger?.warn({ error }, 'better_auth_api_error')
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
