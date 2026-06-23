import { APIError } from 'better-auth/api'
import type { AdminRepository } from '../../application/admin/ports'

/**
 * Better Auth database/event hooks for invite-only onboarding + audit (US3).
 *
 * - `user.create.before` is the **allowlist gate** (FR-014/FR-016): account
 *   creation is allowed only for an email with an open invitation. Uninvited
 *   member sign-ups are rejected and audited (`unauthorized_signup_attempt`,
 *   FR-005). Admin creation is exempt so the out-of-band owner/admin bootstrap
 *   (seed / admin API) works without an invitation.
 * - `user.create.after` consumes the invitation (pending → used) and audits
 *   `account_created`.
 * - `session.create.after` audits `sign_in`.
 *
 * Pure decision logic lives here against the `AdminRepository` port so it is
 * unit-tested with an in-memory fake; the Drizzle wiring is exercised by the
 * Testcontainers integration suite.
 */
export interface AllowlistHooksDeps {
  readonly repo: AdminRepository
}

interface HookUser {
  readonly id: string
  readonly email: string
  readonly role?: string
}

interface HookSession {
  readonly id: string
  readonly userId: string
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

interface RequestMeta {
  readonly ipAddress: string | null
  readonly userAgent: string | null
}

/** Best-effort client metadata from the endpoint context (absent for seed/server creation). */
function requestMeta(ctx: unknown): RequestMeta {
  const candidate = ctx as { headers?: unknown; request?: { headers?: unknown } } | undefined
  const headers = (candidate?.headers ?? candidate?.request?.headers) as Headers | undefined
  if (!headers || typeof headers.get !== 'function') {
    return { ipAddress: null, userAgent: null }
  }
  return {
    ipAddress: headers.get('x-forwarded-for') ?? headers.get('x-real-ip'),
    userAgent: headers.get('user-agent'),
  }
}

export function createAllowlistHooks(deps: AllowlistHooksDeps) {
  const { repo } = deps

  return {
    user: {
      create: {
        before: async (user: HookUser, ctx: unknown): Promise<{ data: HookUser }> => {
          const email = normalizeEmail(user.email)
          const open = await repo.findOpenInvitationByEmail(email)
          if (open) return { data: user }
          // Owner/admin bootstrap is created out-of-band (seed / admin API) and
          // is not gated by the allowlist; everyone else needs an invitation.
          if (user.role === 'admin') return { data: user }

          await repo.recordSecurityEvent({
            eventType: 'unauthorized_signup_attempt',
            email,
            ...requestMeta(ctx),
          })
          throw new APIError('FORBIDDEN', {
            message: 'No valid invitation exists for this email address',
          })
        },
        after: async (user: HookUser, ctx: unknown): Promise<void> => {
          const email = normalizeEmail(user.email)
          await repo.consumeInvitationByEmail(email, user.id)
          await repo.recordSecurityEvent({
            eventType: 'account_created',
            userId: user.id,
            email,
            ...requestMeta(ctx),
          })
        },
      },
    },
    session: {
      create: {
        after: async (session: HookSession, ctx: unknown): Promise<void> => {
          await repo.recordSecurityEvent({
            eventType: 'sign_in',
            userId: session.userId,
            ...requestMeta(ctx),
          })
        },
      },
    },
  }
}

export type AllowlistHooks = ReturnType<typeof createAllowlistHooks>
