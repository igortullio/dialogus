# Implementation Plan: Multi-User Accounts & Per-User Data Isolation

**Branch**: `001-multi-user-auth` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-multi-user-auth/spec.md`

## Summary

Turn the single-user dIAlogus into an **invite-only multi-user** app so it can be
deployed safely: each person signs in and gets a private workspace
(conversations + library + preferences) isolated from everyone else, while the
expensive public-domain reading corpus is ingested **once** and reused across
users.

**Technical approach** (from [research.md](./research.md)): adopt **Better Auth**
(email + password, DB-backed sessions, admin/roles, built-in rate limiting)
mounted on the existing **Hono API** at `/api/auth/*`, persisting through the
**Drizzle/Postgres** datastore. Invite-only is enforced with `disableSignUp` plus
a `user.create.before` allowlist hook. Per-user isolation is added as the only new
per-user concepts over the already-shared corpus: a `library_entries` membership
join, `user_book_preferences` for account-scoped spoiler caps, and binding Mastra
thread `resourceId` to the authenticated `userId` behind an authenticated proxy
(closing a current leak where threads list across users and Mastra is reachable
unauthenticated from the browser). Email (invites/reset) goes through an internal
`sendEmail()` port with a deterministic `mock` mode. New tables are authored as
Drizzle schema and migrated via drizzle-kit (`0008`–`0011`).

## Technical Context

**Language/Version**: TypeScript 5.x (`strict`), Node ≥ 22.13, pnpm ≥ 9.15
(Corepack).

**Primary Dependencies**: Next.js 16 (App Router), Hono 4, Mastra (Claude agent),
Drizzle ORM, pg-boss, Zod, TanStack Query, shadcn/ui (new-york) + Tailwind v4.
**New**: `better-auth ^1.3.x` (+ `@better-auth/cli` dev), `resend` (email).

**Storage**: single Postgres 18 + pgvector via Drizzle. Better Auth core tables +
app tables (`invitations`, `security_events`, `library_entries`,
`user_book_preferences`) authored as Drizzle migrations; Mastra Memory tables
(`mastra_threads/messages/resources`) remain framework-owned in the same DB.

**Testing**: Vitest 4 (unit), Testcontainers (integration over real
Postgres/pgvector/pg-boss), Playwright + `@axe-core/playwright` + Lighthouse
(web E2E + a11y).

**Target Platform**: containerized Linux server behind a single-origin reverse
proxy (HTTPS); modern browsers. Invite-only deployment.

**Project Type**: web — pnpm monorepo (`apps/web`, `apps/api`, `apps/mastra`,
`apps/worker` + `packages/*`).

**Performance Goals**: sign-in to private workspace ≤ 3 steps / < 5s (SC-001);
already-ingested title available to a new user < 5s with zero extra processing
(SC-003/004); chat streaming preserved; spoiler filtering stays in SQL on the HNSW
index; support owner + ≥ 10 concurrent users with no cross-talk (SC-006/007).

**Constraints**: single Postgres (no 2nd datastore — DB-backed rate limiting, no
Redis); schema only via Drizzle migrations; secrets via the `@dialogus/shared` Zod
env schema; RFC 9457 problem+json for app endpoints (Better Auth group exempt);
DDD layering; `apps/api` only enqueues / `apps/worker` only consumes pg-boss;
Lighthouse a11y ≥ 0.9 with zero axe violations; cognitive complexity ≤ 15.

**Scale/Scope**: personal/shared invite-only deployment (owner + ~10s of users),
not a large public service.

## Constitution Check

*GATE: re-checked after Phase 1 design — PASS with two justified deviations
(E1, E2) recorded in Complexity Tracking.*

- [x] **I. Code Quality & Maintainability** — `pnpm lint`/`typecheck` stay clean;
  the auth instance, hooks, route gating, email-provider selection and membership
  logic are split into small helpers (≤ 15 cognitive complexity). DDD layering
  holds: Better Auth + email providers live in `apps/api` **infrastructure**;
  user-scoping flows through application services; the `apps/api` (enqueue-only) vs
  `apps/worker` (consume) split is unchanged. Significant choices (auth lib, error
  exemption, Mastra ownership boundary) are slated for ADRs.
- [x] **II. Testing Standards** — tests specified at the right layer (see
  `quickstart.md`): Vitest unit, Testcontainers integration for auth/membership/
  rate-limit/ingestion-dedup against real infra, Playwright + axe for auth + the
  two-user isolation journeys. The spoiler-cap correctness contract keeps its
  threshold tests (now per-user); new isolation behavior (SC-002) gets dedicated
  cross-user tests; the live `listThreads` leak gets a regression test.
- [x] **III. User Experience Consistency** — new app errors use RFC 9457
  problem+json with documented `urn:dialogus:problems:<slug>` (unauthorized,
  forbidden, invitation-invalid, rate-limited, ingestion-concurrency-limit,
  last-admin); list endpoints (invitations/members/library) keep cursor pagination
  + Zod envelopes; sign-in/account UI uses shadcn/Tailwind tokens, PT/EN behavior,
  Lighthouse a11y ≥ 0.9, zero axe violations, keyboard nav. **Deviation E1**: the
  Better Auth `/api/auth/*` group emits its own JSON errors (exempt).
- [x] **IV. Performance Requirements** — spoiler filtering stays in SQL on the HNSW
  index (only the cap's *source* moves to a per-user table; the recommended
  hardening makes delivery structural, strengthening it); responses still stream;
  Gutendex LRU + prompt caching + 2s ingestion polling unchanged; ingestion stays
  the idempotent, resume-from-failed-stage pg-boss chain with a per-user concurrency
  cap enforced at the enqueue layer; rate limiting is DB-backed (multi-process safe).
- [x] **Tech & workflow constraints** — single Postgres preserved (rate-limit table
  in-DB, no Redis); all schema via Drizzle migrations `0008`–`0011` (Better Auth
  tables transcribed to Drizzle schema, `drizzle-kit`-generated; its own `migrate`
  never run). **Deviation E2**: Mastra-owned thread tables are framework-managed and
  not Drizzle-migratable. New secrets added to the `@dialogus/shared` Zod schema;
  pre-commit + the 6-job CI matrix must stay green.

## Project Structure

### Documentation (this feature)

```text
specs/001-multi-user-auth/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions + rationale + alternatives
├── data-model.md        # Phase 1 — entities, FKs (text userId), migrations 0008–0011
├── quickstart.md        # Phase 1 — runnable validation scenarios
├── contracts/           # Phase 1 — auth, admin-invitations, library, preferences, threads
│   ├── README.md
│   ├── auth-sessions.md
│   ├── admin-invitations.md
│   ├── library.md
│   ├── preferences.md
│   └── threads.md
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
apps/
├── api/                        # Hono API (:3001) — auth host + scoped data routes
│   └── src/
│       ├── index.ts            # mount Better Auth /api/auth/*; CORS+session; requireAuth; wire userId into route deps
│       ├── infrastructure/
│       │   ├── auth/           # NEW: better-auth instance, admin plugin, invite-only hook, session middleware, seed:owner
│       │   ├── email/          # NEW: sendEmail() port + ResendEmailProvider + MockEmailProvider (selectEmailProvider)
│       │   └── http/
│       │       ├── middleware/ # problem.ts (+ new slugs); requireAuth/requireAdmin
│       │       └── routes/     # library.ts (user-scoped), preferences.ts (NEW), admin/invitations+members (NEW)
│       └── application/
│           ├── library/        # add/list/get/remove/restore (+userId), ingest (+membership +concurrency cap), getChunk/getIngestionStatus/retryIngest (+membership)
│           ├── preferences/    # NEW: read/upsert spoiler caps
│           └── admin/          # NEW: invitations + member access control + last-admin guard
├── web/                        # Next.js 16 (:3000)
│   └── src/
│       ├── middleware.ts       # NEW: nodejs-runtime session gate → redirect /sign-in
│       ├── app/
│       │   ├── (auth)/         # NEW: sign-in, accept-invite, reset-password (shadcn/Tailwind, a11y)
│       │   ├── page.tsx        # gate + forward inbound Cookie on SSR fetches
│       │   └── api/            # authenticated thread proxy: stream (+resourceId) and list/get/patch/delete/messages
│       ├── lib/
│       │   ├── auth-client.ts  # NEW: better-auth client
│       │   ├── api/_envelope.ts# forward Cookie / credentials:'include'; 401 → sign-in
│       │   ├── api/threads.ts  # authenticated, resourceId-scoped (no direct browser→Mastra)
│       │   ├── health.ts, library.ts  # SSR Cookie forwarding
│       │   ├── query-keys.ts   # scope thread keys by userId / clear on auth change
│       │   └── spoiler-cap.ts  # API-backed (was localStorage)
│       └── components/chat/    # resourceId=userId; cache isolation; ThreadHeader caps via API
├── mastra/                     # Mastra (:3002)
│   └── src/index.ts            # NEW: server.auth → verify session/token, resourceId=userId
└── worker/                     # pg-boss consumer — boundary unchanged

packages/
├── db/
│   ├── src/schema/             # NEW: auth tables, invitations, security_events, library_entries, user_book_preferences (+ index.ts exports)
│   └── drizzle/                # NEW migrations 0008_auth_core … 0011_user_book_preferences
├── shared/
│   └── src/
│       ├── config/             # extended Zod env schema (auth/email/abuse/session vars)
│       └── schemas/            # preferences schema (reuse spoiler_caps shape from chat.ts)
├── catalog/                    # LibraryEntryRepository (or extended BookRepository); user-scoped app fns
├── ingestion/                  # unchanged idempotent pipeline
└── rag/                        # unchanged SQL spoiler clause (cap source changes upstream)
```

**Structure Decision**: existing web monorepo. The feature is additive plus
targeted user-scoping; no new app or package is introduced. Auth and email are
new **infrastructure** modules inside `apps/api`; identity/membership/preference
tables join the existing `@dialogus/db`; the only cross-process change is Mastra
gaining `server.auth` and the web routing thread calls through an authenticated
proxy instead of directly to Mastra.

## Complexity Tracking

Two justified deviations from the constitution; both keep the simpler alternative
explicitly rejected.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **E1** — Better Auth `/api/auth/*` endpoints are exempt from the RFC 9457 problem+json contract (Principle III) | Better Auth owns its request/response + error format; remapping its JSON errors through `createProblemMiddleware` would corrupt the auth protocol the client library expects | Forcing problem+json onto auth routes would break Better Auth's client/SDK contract and require re-wrapping every auth response. The app's **own** endpoints stay fully compliant; only the third-party auth group is exempt, and new app error slugs are added. |
| **E2** — Mastra-owned `mastra_threads`/`mastra_messages`/`mastra_resources` are not authored as Drizzle migrations (Tech constraint: schema via Drizzle) | These tables are framework-managed: hardcoded names, auto-created/migrated by `PostgresStore.init()`; only `schemaName` is configurable, so they cannot be expressed as Drizzle migrations | Hand-writing Drizzle migrations for them would fight the framework and drift from what Mastra actually creates. All **app-owned** tables remain Drizzle; the thread→user link is logical (`resourceId == user.id`), and account-deletion cleanup uses Mastra's delete APIs instead of DB cascades. |
```
