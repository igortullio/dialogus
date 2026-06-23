import type { Database } from '@dialogus/db'
import { account, rateLimit, session, user, verification } from '@dialogus/db/schema'
import type { DialogusEnv } from '@dialogus/shared/config'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins'
import type { Logger } from 'pino'
import type { EmailProvider } from '../email'

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
}

const DEV_SECRET = 'dev-insecure-better-auth-secret-change-me'

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
      // Invite-only: public sign-up is blocked; accounts are created by the
      // owner seed / admin API, and (in the onboarding story) by an allowlist
      // `user.create.before` hook.
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
      expiresIn: config.SESSION_MAX_AGE_SECONDS,
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: config.AUTH_RATE_LIMIT_SIGNIN_MAX },
      },
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: config.NODE_ENV === 'production',
        httpOnly: true,
      },
    },
    plugins: [admin({ defaultRole: 'member', adminRoles: ['admin'] })],
    onAPIError: {
      onError: (error) => {
        logger?.warn({ error }, 'better_auth_api_error')
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
