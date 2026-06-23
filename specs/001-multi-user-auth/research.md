# Phase 0 Research: Multi-User Accounts & Per-User Data Isolation

**Feature**: `001-multi-user-auth` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)

This document records the technical decisions that resolve the spec's
requirements into an implementable approach, grounded in the current dIAlogus
codebase. Each decision lists what was chosen, why, and what was rejected.

> **Critical finding (security):** Conversation isolation is *not* a greenfield
> add — it fixes an existing leak. `apps/web/src/lib/api/threads.ts` calls
> `GET /api/memory/threads` with **no `resourceId` filter**, so it returns every
> user's threads, and the Mastra server is reachable **directly from the browser**
> via the client-exposed `NEXT_PUBLIC_MASTRA_URL` with **no auth**. Per-user
> scoping must therefore be enforced server-side, and the browser must stop
> calling Mastra directly. See "Area 2".

---

## Area 1 — Authentication library & integration architecture

### Decision: Better Auth (`better-auth ^1.3.x`) as the auth core, mounted on the Hono API

- **Chosen**: Email + password with DB-backed server-side sessions, using the
  framework-agnostic Better Auth core mounted on `apps/api` (Hono) as a
  catch-all route group: `app.on(['POST','GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))`.
  Persistence via the Drizzle adapter (`drizzleAdapter(db, { provider: 'pg' })`)
  reusing the single Postgres `Database`. Roles, ban/revoke, and server-only user
  creation come from the **admin plugin**.
- **Rationale**: One Web-standard `fetch` handler drops into the existing
  `@hono/node-server` app; ships industry-standard password hashing, single-use
  time-limited reset tokens, multi-device DB sessions, role + ban (session
  revocation), and built-in DB-backed rate limiting — covering FR-003, FR-004,
  FR-005, FR-015, FR-017, FR-018, FR-019, FR-020, FR-021 without bespoke crypto.
  Co-locating with the API (which already owns all data routes and CORS) keeps a
  single cookie origin for the browser.
- **Alternatives rejected**:
  - *Auth.js / NextAuth* — Next-route-centric; sharing sessions with a standalone
    Hono API on :3001 is awkward; credentials provider is discouraged; invite-only,
    roles, rate limiting and DB sessions all need custom glue.
  - *Hand-rolled Drizzle sessions* — re-implements hashing, CSRF, secure cookies,
    single-use reset tokens, rotation/expiry, rate limiting and audit. High
    security surface, rejected for a small deployment (and against FR-005's
    "industry-standard" intent).
  - *Lucia* — now maintenance-only / deprecated as a library.

### Decision: Invite-only enforced with `disableSignUp` + a `user.create.before` hook

- **Chosen**: `emailAndPassword.disableSignUp: true` **plus** a
  `databaseHooks.user.create.before` hook that looks up the normalized email in
  an app-owned `invitations` (allowlist) table; reject with an `APIError` and
  write a `security_events` row when the email is not authorized, and mark the
  invitation consumed on success. Owner/admin vs member roles come from the admin
  plugin; the **last-admin safeguard (FR-017)** is enforced in app logic before
  any ban/role change.
- **Rationale**: `disableSignUp` blocks open registration; the before-hook is the
  documented mechanism to allow only authorized emails (FR-014, FR-016) and gives
  a natural place to record unauthorized attempts (FR-005). The admin plugin
  supplies the role column + ban/unban/createUser/list, avoiding a hand-rolled
  roles system.
- **Alternatives rejected**: the **organization plugin** (models multi-org
  tenancy with member/invitation tables — explicitly Out of Scope); a pure
  allowlist with no admin plugin (loses ready-made ban + session revocation).

### Decision: Next.js reads the session by forwarding cookies to the API; routes gated server-side

- **Chosen**: A Node-runtime middleware (`export const config = { runtime: 'nodejs' }`)
  plus Server Components read the session by forwarding the inbound `Cookie`
  header to the Hono API (`auth.api.getSession({ headers })` or a
  `GET /api/auth/get-session` fetch). Unauthenticated requests redirect to
  `/sign-in`; the conversation, library, ingestion and preference surfaces are
  gated (FR-001).
- **Rationale**: The session is validated by the API (the cookie's origin), so
  the web tier only forwards cookies. Optimistic edge cookie-cache checks cannot
  honor revocation/ban, so DB-validated `getSession` is the source of truth for
  gating.

### Decision: Single-origin deployment; `SameSite=Lax; Secure; HttpOnly` cookies

- **Chosen**: Serve web + API under **one origin** in both environments — prod
  behind a reverse proxy (e.g. `app.example.com` + `app.example.com/api`), dev via
  a Next.js rewrite/proxy so the browser reaches the API same-origin. Session
  cookie attributes: `SameSite=Lax; Secure; HttpOnly`. Better Auth `trustedOrigins`
  set from `APP_URL` / `AUTH_TRUSTED_ORIGINS`.
- **Rationale**: Same-origin sidesteps the cross-origin cookie footgun
  (`SameSite=None` *requires* `Secure`, and a credentialed CORS response cannot
  use `Origin: '*'`). `Lax` is CSRF-safer than `None`. Server-side SSR fetches
  still must forward the inbound `Cookie` header regardless of origin strategy.
- **Documented fallback**: keep the current cross-origin :3000↔:3001 topology with
  `SameSite=None; Secure` cookies, `cors({ credentials: true, origin: WEB_ORIGIN })`
  (never `'*'`) on the API, and `credentials: 'include'` on the web fetch layer.
  Requires HTTPS locally; reserved for if the proxy approach is undesirable.

### Decision: `text` user IDs; app foreign keys to the user are `text`

- **Chosen**: Keep Better Auth's default `text` primary keys for
  user/session/account/verification. Every app FK that references the user
  (`library_entries.user_id`, `user_book_preferences.user_id`,
  `security_events.user_id`, `invitations.invited_by` / `consumed_by_user_id`,
  and the thread owner / Mastra `resourceId`) is therefore **`text`**. Existing
  `books`/`chapters`/`chunks` keep their `uuid` PKs (they are not user-owned).
- **Rationale**: Better Auth generates string ids by default; forcing uuid fights
  the library. Mixing `text` user FKs with `uuid` corpus PKs is fine as long as
  each join column matches the type it references. **This corrects the
  library/preferences research, which had assumed `uuid` user FKs.**

### Decision: Better Auth tables are authored as Drizzle schema and migrated via drizzle-kit

- **Chosen**: Generate the Better Auth table definitions (with
  `@better-auth/cli generate`), transcribe them into `packages/db/src/schema/*`
  Drizzle modules, and produce SQL via `drizzle-kit` into `packages/db/drizzle/`.
  Better Auth's own `migrate` is **never** run against the live DB.
- **Rationale**: The constitution mandates one migration authority
  (`packages/db/drizzle`, applied by `packages/db/src/migrate.ts`). Letting the
  Better Auth CLI own tables would create a second, out-of-band migration path and
  invisible drift.

### Decision: Password reset + rate limiting

- **Chosen**: `sendResetPassword` emails a single-use, time-limited token (stored
  in the `verification` table); the client calls `resetPassword({ token, newPassword })`
  (FR-019). Rate limiting uses Better Auth's built-in `rateLimit` with
  `storage: 'database'` (a `rate_limit` table) and tighter `customRules` on
  `/sign-in/email`, password-reset request, and sign-up/invite acceptance (FR-021).
- **Rationale**: DB storage is required because the deployment is multi-process
  (api, worker, mastra); in-memory counters would not bound abuse across
  instances. Redis was rejected (second datastore, no justification at this scale).

---

## Area 2 — Conversation/thread per-user scoping (Mastra Memory)

### Finding: threads are single-user today and leak across users

`RESOURCE_ID = 'owner'` is hardcoded in `apps/web/src/components/chat/DialogusThread.tsx:21`
and sent only on the stream call. List/get/patch/delete send **no** `resourceId`.
Thread storage lives in Mastra-owned tables (`mastra_threads`, `mastra_messages`,
`mastra_resources`) created by `PostgresStore.init()`; per-thread titles/pins live
in `mastra_threads.metadata` (`custom_title`, `pinned`, `book_ids`). The browser
calls Mastra **directly** (`NEXT_PUBLIC_MASTRA_URL`) with no auth.

### Decision: enforce ownership server-side via Mastra `server.auth`, and stop direct browser→Mastra calls

- **Chosen**:
  1. Configure `new Mastra({ server: { auth: { ... } } })` in `apps/mastra/src/index.ts`
     so an `authenticateToken` + `mapUserToResourceId` (or a `server.middleware`
     that sets `MASTRA_RESOURCE_ID_KEY` in `requestContext`) makes
     `getEffectiveResourceId` derive `resourceId = authenticated userId`
     server-side; Mastra's built-in ownership checks then 404 on `resourceId`
     mismatch for every get/delete/patch.
  2. Route **all** browser thread operations (list/get/patch/delete/messages and
     the stream) through an **authenticated boundary** — the existing Next route
     proxy pattern (`apps/web/src/app/api/agents/.../stream/route.ts`), extended to
     the other operations — which reads the Better Auth session, derives `userId`,
     and forwards a verifiable credential to Mastra. The browser no longer uses
     `NEXT_PUBLIC_MASTRA_URL` directly; Mastra is not publicly exposed.
  3. `listThreads` must pass `resourceId = userId` (or rely on the auth-context
     default).
- **Rationale**: FR-006 / SC-002 require isolation that cannot be bypassed via
  direct identifiers. Client-side filtering is insufficient (and absent today).
  `thread.resourceId` is **immutable after creation** and Mastra errors on
  cross-owner threadId reuse, so binding `resourceId` from the auth context at
  creation is durable; never trust the client-supplied `memory.resource`.
- **Alternatives rejected**: client-side filtering (bypassable); proxying every
  memory op through `apps/api` and re-implementing ownership checks (heavier,
  duplicates Mastra's built-ins, and still needs Mastra `server.auth` so the port
  isn't an open backdoor).

### Decision: per-thread titles/pins stay in Mastra metadata; no app thread table

- **Chosen**: Keep `custom_title`, `pinned`, `book_ids` in `mastra_threads.metadata`.
  They become per-user automatically once each thread row carries the user's
  `resourceId`. No separate Drizzle thread table.
- **Rationale**: Rows are keyed by `resourceId`; scoping the `resourceId` scopes
  titles/pins. Duplicating into Drizzle would fight the framework and need syncing.

### Decision: client cache isolation on auth change

- **Chosen**: Scope `THREADS_QUERY_KEY` (and thread-metadata keys) by `userId`, or
  clear the React Query cache + SSR-prefetched threads on sign-out / user switch.
- **Rationale**: `['threads']` is global today; on a shared browser User B could
  briefly see User A's cached/prefetched threads.

> **Justified constitution exception**: `mastra_threads` / `mastra_messages` /
> `mastra_resources` are framework-owned (hardcoded names, auto-created by
> `PostgresStore.init()`; only `schemaName` is configurable). They **cannot** be
> expressed as Drizzle migrations. The thread→user link is **logical**
> (`mastra_threads.resourceId == user.id`, a string, no cross-boundary FK).
> Account deletion (FR-023) must delete a user's threads via Mastra's delete APIs,
> not DB cascades.

---

## Area 3 — Per-user library over a shared ingested corpus

### Finding: `books` is already a shared per-title corpus

`books` has `UNIQUE(gutendex_id)` and a single global `ingestion_status`;
`chapters`/`chunks`/`chapter_summaries` FK to `books.id` with **no** user column.
The only single-user coupling is that "in my library" is conflated with the
**global** `books.deleted_at` soft-delete, and `addBookToLibrary` throws
`DuplicateBookError` on an existing `gutendex_id`.

### Decision: add a `library_entries` membership join; keep books + ingestion global

- **Chosen**: New table `library_entries(user_id text, book_id uuid, added_at, deleted_at)`
  with `UNIQUE(user_id, book_id)`. `books`, `chapters`, `chunks`,
  `chapter_summaries` stay globally keyed by `book_id` only. The user-visible
  status is **derived** from the global `books.ingestion_status` (no per-user
  status column).
- **Rationale**: The corpus is already shared per title (FR-010); membership is
  the only new per-user concept (FR-007, FR-011, FR-013). A per-user status column
  would just mirror the global one and could drift. SC-003 / SC-004 (available in
  <5s, no extra processing) fall out: adding a title whose global status is
  already `ready` creates the membership and shows ready with no enqueue.
- **Alternatives rejected**: `user_id` on `books` (breaks the shared corpus,
  re-ingests per user — violates FR-010/FR-012); an array of user ids on `books`
  (not relational, no per-user `added_at`/`deleted_at`, bad for cursor pagination).

### Decision: add = idempotent resolve-or-create + membership upsert; ingest only when `discovered`; dedup concurrent first-adds

- **Chosen**: On add — resolve-or-create the shared book by `gutendex_id` (create
  only if absent, `ingestion_status='discovered'`), then upsert the user's
  membership (insert or clear `deleted_at`). If global status is `ready`, do
  nothing (instant). If `discovered`, enqueue `ingestion.download` from the **API
  route** (not the domain layer) with a **deterministic** `Idempotency-Key`
  `ingest-{bookId}`. The existing `ingestionStatus !== 'discovered'` guard in
  `ingest.ts` (which flips the row to `downloading` immediately) plus the
  deterministic idempotency key collapse concurrent first-adds to exactly one
  enqueue (FR-012).
- **Rationale**: The `discovered`-only guard + `idempotency_keys` table already
  give exactly-once enqueue; a deterministic key (vs the web's current random
  `ingest-{bookId}-{uuid}`) is the robust dedup. Only `apps/api` enqueues; the
  worker consumes — constitution respected.
- **Alternatives rejected**: enqueue inside the domain `addBookToLibrary`
  (domain must not know pg-boss); advisory locks (the guard + idempotency key
  suffice).

### Decision: per-user soft-remove; never touch global content

- **Chosen**: `removeBook(userId, bookId)` sets `library_entries.deleted_at` for
  that `(user, book)` only; `restoreBook(userId, bookId)` clears it. The global
  `books.deleted_at` is decoupled and becomes an owner/catalog archival concern,
  never touched by member remove/restore. Removing the last member does **not**
  destroy shared chapters/chunks (FR-013).
- **Rationale**: Today `removeBook` flips the **global** `books.deleted_at`, which
  would wipe the title for everyone — the core behavior to invert. Soft-delete
  preserves the per-user re-add UX (`AddGutendexSheet` restore flow).

### Decision: every library application fn + route becomes user-scoped

`addBookToLibrary`, `listLibrary`, `getBook`, `removeBook`, `restoreBook` gain a
`userId` argument; introduce a `LibraryEntryRepository` (or extend
`BookRepository`) for membership-aware queries. `listLibrary` keeps cursor
pagination + the Zod envelope but joins through `library_entries` and orders by
`added_at`. The ingestion-adjacent routes (`getChunk`, `getIngestionStatus`,
`retryIngest`) gain **membership authorization** so a non-member cannot read
another user's chunk text/citation, see ingestion status, or drive ingestion
cost (FR-007, FR-008, FR-021, SC-002). Cross-user direct-id access returns
`BookNotFoundError` (don't leak existence).

---

## Area 4 — Operations: email, secrets/config, abuse, cookies/CORS

### Decision: Resend for email behind an internal `sendEmail()` port + a deterministic `mock`

- **Chosen**: `resend` SDK for production; a single internal `sendEmail()` port
  with `ResendEmailProvider` and `MockEmailProvider`, selected by `EMAIL_PROVIDER`
  (`mock | resend`). Selection mirrors `apps/worker/src/deps.ts` `selectEmbeddingProvider`
  exactly (explicit env → `source:'env'`; absent → `resend` in production else
  `mock`; choosing `resend` throws if `RESEND_API_KEY` is missing). The mock logs
  a structured pino line containing recipient, subject, and the full invite/reset
  URL+token, then resolves — so e2e/integration tests scrape the link from logs.
- **Rationale**: At owner + ~10 users, Resend is one HTTPS dependency with a typed
  SDK, no SMTP infra/secrets, and a sandbox onboarding domain so the first invite
  can go out before a custom domain exists (domain setup is Out of Scope). The
  mock mirrors the project's established mock-provider convention and keeps
  CI/offline deterministic.
- **Alternatives rejected**: SMTP/nodemailer (more config + an external relay for
  no benefit), SES (heavier IAM/sandbox), Postmark (viable, heavier onboarding).

### Decision: per-user concurrent-ingestion cap enforced in the API application layer

- **Chosen**: In `ingestBook` (`apps/api/src/application/library/ingest.ts`),
  **before** enqueue, count the requesting user's in-flight ingestions (their
  `library_entries` whose book `ingestion_status` is non-terminal) and reject with
  `429` `urn:dialogus:problems:ingestion-concurrency-limit` + `Retry-After` when
  `>= INGESTION_USER_CONCURRENCY_LIMIT`. Never gate inside pg-boss/the worker.
- **Rationale**: `apps/api` only enqueues; the worker's `batchSize:1` is a global
  per-stage serializer, not a per-user cap. A user-scoped `COUNT` at the existing
  enqueue point is cheap, atomic against the same Postgres, and reuses the
  existing `Retry-After` problem+json machinery (FR-021). The count + enqueue +
  status-flip should be atomic enough (transaction / conditional update) to avoid
  a two-request race.

### Decision: env additions validated through the `@dialogus/shared` Zod schema

New vars in `packages/shared/src/config/index.ts`, validated at boot via
`loadConfig()` (no scattered `process.env`): `BETTER_AUTH_SECRET` (required in
prod), `APP_URL`, `AUTH_TRUSTED_ORIGINS`, `EMAIL_PROVIDER`, `RESEND_API_KEY`
(guarded-required when provider=resend/prod), `EMAIL_FROM`,
`INGESTION_USER_CONCURRENCY_LIMIT` (default 2–3), `SESSION_MAX_AGE_SECONDS`
(default ~7d), `AUTH_RATE_LIMIT_SIGNIN_MAX`, and a Mastra auth secret.

### Scope boundary (deployment readiness)

- **IN scope**: env-schema additions + boot validation; secure-cookie config;
  HTTPS/`Secure`-cookie assumption for prod; `trustedOrigins` / CORS wiring; the
  mock email mode.
- **OUT of scope**: domain purchase, hosting + TLS/cert provisioning,
  reverse-proxy setup, CI/CD, backups (per spec Out of Scope).

---

## Area 5 — Per-user preferences (account-scoped spoiler caps)

### Finding: caps ride localStorage today, and reach SQL via the prompt

Caps live in `localStorage` (`dialogus:spoiler_cap:<threadId>:<bookId>`), read by
`useSpoilerCap` (`apps/web/src/lib/spoiler-cap.ts`) and surfaced in
`ThreadHeader.tsx`. They reach retrieval as a **text prefix** the proxy injects
(`[Available books: …; Spoiler caps: {…}]`), which the agent is *instructed* to
echo into the `semantic_search` tool's `spoiler_caps` argument, where
`DialogusChunkReadAdapter.spoilerCapClause` finally enforces it in SQL
(constitution-compliant: filtered in SQL, not post-filter).

### Decision: `user_book_preferences` table, account-scoped per (user, book)

- **Chosen**: New `user_book_preferences(user_id text, book_id uuid, spoiler_cap_chapter integer NULL, …)`
  with `UNIQUE(user_id, book_id)` and upsert on write. `NULL = no cap`. Read/write
  via new `apps/api` endpoints (`GET /api/preferences/spoiler-caps?book_ids=…`,
  `PUT /api/preferences/spoiler-caps/:bookId`) with user identity from the session
  (never the request body); errors as problem+json, responses as Zod envelopes
  (reuse the `spoiler_caps` shape from `packages/shared/src/schemas/chat.ts`).
- **Rationale**: FR-009 / SC-008 require caps to follow the account across
  devices, so account-scoped per-book (not per-device, not per-thread) matches
  FR-008's "per-book spoiler boundary." `spoiler_cap_chapter` stores the max
  visible chapter ordinal exactly as the SQL clause expects.
- **Alternatives rejected**: per-(user, thread, book) granularity (caps wouldn't
  survive new threads); a JSONB blob on the user row (breaks FK integrity to
  books); reusing Mastra thread metadata (thread-scoped, not account-scoped).

### Decision: minimal blast radius downstream; recommended hardening of cap delivery

- **Chosen**: Keep the existing `spoiler_caps` map → prompt-prefix → tool-arg →
  SQL pipeline; only change the **source** of the map from `readAllSpoilerCaps`
  (localStorage) to the user's caps fetched from the new API for the thread's
  current `bookIds`. `ThreadHeader` reads/writes through a TanStack-Query hook
  instead of localStorage. Per FR-022, do **not** migrate existing localStorage
  caps (optional best-effort one-time client upload, then clear).
- **Recommended hardening (in scope)**: caps currently reach SQL only if the model
  echoes the prompt prefix — a model that ignores it silently disables the cap.
  Inject the authenticated user's caps **structurally** (server-side, via the
  Mastra proxy `requestContext` / tool default args) so the SQL clause cannot be
  bypassed by a non-compliant model. This strengthens FR-008 and Principle III/IV
  and is the single biggest robustness win; it pairs naturally with the Area 2
  authenticated Mastra boundary.

---

## Cross-cutting reconciliations (planner decisions across areas)

1. **User PK type** — `text` (Better Auth default). All user FKs are `text`;
   corpus PKs stay `uuid`. (Overrides the uuid assumption in Areas 3 & 5.)
2. **Migration order** — auth/identity first, then tables that FK the user, in
   build/priority order: `0008_auth_core` (user, session, account, verification,
   rate_limit) → `0009_library_entries` → `0010_user_book_preferences` (both P1,
   US2) → `0011_invitations_and_security_events` (P2, US3). Both per-user groups
   depend only on `auth_core`, so the relative order follows the implementation
   sequence; the only fixed constraint is users before any referencer.
3. **Spoiler cap home** — `user_book_preferences` (per user+book), **not** a
   column on `library_entries`. (Resolves Area 3's open question.)
4. **Cookie strategy** — single-origin (`SameSite=Lax; Secure; HttpOnly`)
   recommended for dev and prod; cross-origin `None;Secure` documented as the
   fallback.
5. **Mastra credential** — the web's server-side proxy authenticates the Better
   Auth session and forwards a verifiable credential (Better Auth bearer/JWT or an
   internal service token) to Mastra `server.auth`; the browser never calls Mastra
   directly. Exact token mechanism validated in implementation.

## Constitution exceptions to record (see plan.md → Complexity Tracking)

- **E1**: Better Auth `/api/auth/*` endpoints emit their own JSON error format and
  are exempt from the RFC 9457 problem+json remapping (the app's own endpoints
  stay compliant; new app error slugs are added).
- **E2**: Mastra-owned `mastra_threads`/`mastra_messages`/`mastra_resources` are
  framework-managed and not authored as Drizzle migrations (all app-owned tables
  remain Drizzle).

## Resolved unknowns

No `NEEDS CLARIFICATION` remain. The two product-scope decisions (shared corpus +
per-user library; invite-only) were resolved with the owner during `/speckit-specify`,
and the no-migration decision (FR-022) was confirmed afterward.
