# ADR-001: Adopt Better Auth for identity, sessions, and access control

## Status

Accepted

## Date

2026-06-23

## Context

Feature 001 turns the single-user dIAlogus into an **invite-only multi-user**
app. That requires email+password sign-in, server-validated sessions (so ban /
revocation take effect immediately), roles (owner/admin vs member), an allowlist
gate on account creation, password reset, and abuse rate-limiting — all mounted
on the existing **Hono** API (`:3001`) over the single **Drizzle/Postgres**
datastore, with no second datastore (constitution: single Postgres).

Hand-rolling auth (password hashing, session tokens, CSRF, reset-token lifecycle,
ban enforcement) is a large, security-sensitive surface we do not want to own.

## Decision

**Use Better Auth (`^1.6`)** mounted on Hono at `/api/auth/*`, persisting through
Drizzle/Postgres.

- **Email + password** with DB-backed sessions (the `session` table is the
  authority — `getSession` validates against the DB, so ban/revoke and expiry are
  honored on the next request, not cached at the edge).
- **Admin plugin** supplies the `role` + `banned` columns and ban/role/session
  operations, avoiding a hand-rolled roles system.
- **DB-backed rate limiting** (`rateLimit.storage: 'database'`, a `rate_limit`
  table) — multi-process safe with no Redis (single-Postgres constraint).
- **Invite-only** via `emailAndPassword.disableSignUp: true` plus a
  `databaseHooks.user.create.before` allowlist hook (see the onboarding story);
  accounts are created server-side (owner seed + accept-invite) through
  `internalAdapter.createUser`, which still runs the hook.
- Better Auth's tables are **authored as Drizzle schema** and migrated via
  drizzle-kit; Better Auth's own `migrate` is never run (one migration authority).

## Alternatives Considered

### Auth.js / NextAuth

- **Pros**: large ecosystem; first-class in Next.js.
- **Cons**: tightly coupled to the Next.js request lifecycle; mounting its handler
  on a standalone Hono API at `:3001` is awkward; its credentials provider is
  explicitly discouraged for password auth; DB-session + roles + invite-only +
  rate-limiting would need significant custom glue.
- **Why rejected**: poor fit for the Hono-hosted, DB-session, invite-only model.

### Lucia

- **Pros**: lightweight, framework-agnostic, Drizzle-friendly.
- **Cons**: now **maintenance-only / being deprecated** as a library (the author
  recommends rolling your own from its learning resources); no batteries-included
  admin/roles, rate limiting, or reset flow.
- **Why rejected**: betting a security-critical foundation on a deprecated library
  is unwise; we'd re-implement most of what Better Auth gives us.

### Roll-your-own

- **Pros**: full control; no dependency.
- **Cons**: we'd own password hashing, session/token lifecycle, CSRF, reset-token
  single-use/expiry, ban enforcement, and rate limiting — high risk, high cost,
  easy to get subtly wrong.
- **Why rejected**: not justified for a personal/small-team deployment; the
  security risk outweighs the control.

## Consequences

- Better Auth owns its own request/response and error format on `/api/auth/*`,
  which is exempt from the app's RFC 9457 contract — see [ADR-002](./adr-002-auth-error-exemption.md).
- Better Auth's admin plugin also registers its own `/api/auth/admin/*` REST
  endpoints; those bypass the app's last-admin guard + allowlist, so the mount
  blocks them and all admin operations flow through the guarded `/api/admin/*`.
- The thread/user link to Mastra stays logical (`resourceId == user.id`) — see
  [ADR-003](./adr-003-mastra-table-ownership.md).
