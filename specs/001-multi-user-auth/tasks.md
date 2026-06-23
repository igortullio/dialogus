---
description: "Task list for Multi-User Accounts & Per-User Data Isolation"
---

# Tasks: Multi-User Accounts & Per-User Data Isolation

**Input**: Design documents from `specs/001-multi-user-auth/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Per Constitution Principle II, tests are included at the right layer for
everything touching auth, Postgres/pgvector/pg-boss, and the correctness contracts
(citation / spoiler-cap / refusal). The pre-existing `listThreads` cross-user leak
gets a regression test. Test tasks are listed FIRST within each story and MUST fail
before implementation.

**Organization**: Tasks are grouped by user story (spec priorities). MVP = US1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4 (Setup, Foundational, Polish carry no story label)
- Exact file paths are included in each task.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and tooling needed before any code.

- [x] T001 Add auth + email dependencies: `better-auth` and `resend` to `apps/api/package.json`, `better-auth` (client) to `apps/web/package.json`, dev `@better-auth/cli` at root; run `pnpm install`.
- [x] T002 [P] Add a `seed:owner` script entry to `apps/api/package.json` (implementation lands in T014).
- [ ] T003 [P] Run `pnpm exec @better-auth/cli generate` against a throwaway config to capture the Better Auth table shape (user/session/account/verification + admin/rateLimit fields) into `specs/001-multi-user-auth/contracts/_generated-auth-schema.txt` as the transcription reference for T005.

**Checkpoint**: Dependencies installed; auth schema shape captured.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The auth backend + shared infrastructure every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Extend the Zod env schema in `packages/shared/src/config/index.ts` with `BETTER_AUTH_SECRET`, `APP_URL`, `AUTH_TRUSTED_ORIGINS`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, `SESSION_MAX_AGE_SECONDS`, `AUTH_RATE_LIMIT_SIGNIN_MAX`, `INGESTION_USER_CONCURRENCY_LIMIT`, and the Mastra auth secret (production guards per `research.md` Area 4); update `.env.example`.
- [x] T005 Author the Better Auth core Drizzle schema (text PKs) in `packages/db/src/schema/auth.ts` (`user` with admin `role`/`banned` columns, `session`, `account`, `verification`, `rate_limit`) and re-export from `packages/db/src/schema/index.ts` (transcribed from T003).
- [x] T006 Generate and commit migration `0008_auth_core` via `pnpm db:generate`; verify `pnpm db:migrate` applies it cleanly to a fresh DB.
- [x] T007 Create the Better Auth instance in `apps/api/src/infrastructure/auth/auth.ts`: `drizzleAdapter(db, { provider: 'pg' })`, `emailAndPassword` (with `disableSignUp: true`), admin plugin, `rateLimit { storage: 'database', customRules }`, session max-age, `trustedOrigins`, and `SameSite=Lax; Secure; HttpOnly` cookie attributes — all read from `@dialogus/shared` config.
- [x] T008 Mount the catch-all `app.on(['POST','GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))` in `apps/api/src/index.ts`, exclude `/api/auth/*` from `createProblemMiddleware` (exception E1), and add `credentials: true` + explicit (non-`*`) origin to the existing `cors()`.
- [x] T009 Add `requireAuth` and `requireAdmin` Hono middleware in `apps/api/src/infrastructure/http/middleware/auth.ts` (read `auth.api.getSession`, put `userId`/`role` on context, 401/403 otherwise).
- [x] T010 Register problem slugs `unauthorized` (401), `forbidden` (403), and `rate-limited` (429, with `Retry-After`) in `apps/api/src/infrastructure/http/middleware/problem.ts`.
- [x] T011 [P] Implement the email `sendEmail()` port + `MockEmailProvider` (logs the link) + `ResendEmailProvider` + `selectEmailProvider` (mirroring `selectEmbeddingProvider` choice/source + production guard) in `apps/api/src/infrastructure/email/`; log `email_provider_selected` on boot.
- [x] T012 [P] Add the Better Auth web client in `apps/web/src/lib/auth-client.ts` and a server-side session-read helper that forwards the inbound `Cookie` to the API.
- [x] T013 Extend `apps/web/src/lib/api/_envelope.ts` (and `lib/health.ts`, `lib/library.ts`) to forward the inbound `Cookie` on SSR fetches and set `credentials: 'include'` on browser fetches; surface 401 as a redirect signal.
- [x] T014 Implement the owner bootstrap seed in `apps/api/src/infrastructure/auth/seed-owner.ts` (Better Auth server-side `createUser`, `role=admin`) wired to the `seed:owner` script; enables multi-account testing before US3.
- [ ] T015 [P] Add a Testcontainers integration harness covering the auth tables + session create/read/expiry **and a sign-in rate-limit/back-off negative assertion** (FR-021 auth-abuse half, against the DB-backed `rate_limit` store) in `apps/api/src/infrastructure/auth/auth.integration.test.ts`.

**Checkpoint**: Auth backend live; accounts can be seeded; sessions validated. User stories can begin.

---

## Phase 3: User Story 1 - Sign in and converse in a private space (Priority: P1) 🎯 MVP

**Goal**: An authorized person signs in, sees only their own conversations, and can sign out; the workspace is locked behind authentication. Fixes the live `listThreads`/Mastra leak.

**Independent Test**: With two seeded accounts, create+name a thread as User A, sign in as User B → empty list and User A's thread unreachable by direct id; signing out re-locks the app.

### Tests for User Story 1 (per Constitution Principle II) ⚠️

- [x] T016 [P] [US1] Integration test (vitest): the proxy route handlers enforce isolation — unauth → 401, cross-user GET/DELETE/messages → 404 (no existence leak), `listThreads` scoped to the session `resourceId`, and the stream binds `memory.resource` to the user (never trusts the client). `apps/web/__tests__/app/api/memory-proxy.test.ts` (10 tests).
- [x] T017 [P] [US1] E2E (Playwright + axe): `__tests__/integration/auth-gate.spec.ts` (redirect when logged out · `/sign-in` zero axe violations · sign-in → workspace → sign-out) — **validated live, 3/3 pass**. Added `__tests__/helpers/auth.ts` (`signIn`) and made the existing `happy-path` + `lighthouse` specs auth-aware (lighthouse-runner gained `cookie` support to audit gated routes). The full happy-path/lighthouse runs need the whole stack + a seeded user (CI), so they're typecheck-validated here, not executed.

### Implementation for User Story 1

- [x] T018 [US1] Defense-in-depth: Mastra `server.middleware` on `/api/*` rejects any request lacking the internal `MASTRA_AUTH_SECRET` bearer token; the web proxies (`mastraFetch` + stream route) forward it. Enforced only when the secret is set (dev/Studio/tests unaffected). **Validated live**: direct Mastra access without the secret → 401, with it → 200, via the proxy → 200, health still up. Closes the directly-exposed-Mastra backdoor.
- [x] T019 [US1] Add authenticated thread proxy route handlers under `apps/web/src/app/api/memory/threads/**` (list/get/delete/patch/messages) that read the Better Auth session → `userId`, scope to the user's `resourceId`, enforce ownership (404 cross-user), and the stream proxy injects `memory.resource = userId` + rejects unauthenticated requests.
- [x] T020 [US1] Rework `apps/web/src/lib/api/threads.ts` to call the authenticated same-origin proxy (not `NEXT_PUBLIC_MASTRA_URL` directly); `resourceId` is injected server-side; all of list/get/delete/patch/messages routed through the proxy (the unused apps/api fallback removed).
- [x] T021 [US1] In `apps/web/src/components/chat/DialogusThread.tsx`, removed the hardcoded `RESOURCE_ID = 'owner'` (owner is bound server-side by the stream proxy) and routed the metadata PATCH through the authenticated proxy.
- [x] T022 [P] [US1] Isolate client caches: clear the React Query cache on sign-out (`AccountMenu` → `queryClient.clear()`) and stopped SSR-prefetching threads in `page.tsx`, so a new user on the same browser never sees the previous user's conversations.
- [x] T023 [US1] Build the sign-in page `apps/web/src/app/(auth)/sign-in/page.tsx` and a sign-out action using the auth client (shadcn/ui new-york + Tailwind tokens, PT/EN, keyboard-accessible).
- [x] T024 [US1] Add the route gate (implemented as `apps/web/src/proxy.ts` — Next 16 renamed the `middleware` convention to `proxy`) redirecting unauthenticated requests → `/sign-in`, and gate `apps/web/src/app/page.tsx` (server-side `getServerSession`; redirect when unauthenticated).
- [x] T025 [US1] The stream proxy and thread proxies reject unauthenticated requests (401) and return 404 for cross-user access; errors surface to the client via `proxyFetch` → `ApiError`. (These are the web app's own route handlers, so they return plain JSON errors rather than the Hono API's `urn:dialogus:problems:<slug>` contract; an explicit XHR-401 → sign-in redirect is a minor follow-up.)

**Checkpoint**: US1 functional — sign in, private conversations, sign out. MVP demoable.

---

## Phase 4: User Story 2 - Maintain a personal library over a shared corpus (Priority: P1)

**Goal**: Each user manages their own library over the shared corpus; adding an already-ingested title is instant; removing affects only their library; per-user spoiler caps + citations are scoped to the user.

**Independent Test**: As User A add+ingest a title; as User B add the same title → `ready` in < 5s, no new pipeline; User B removes it → User A still has it; direct-id access to a non-member title → `book-not-found`; spoiler cap set on one device shows on another.

### Tests for User Story 2 (per Constitution Principle II) ⚠️

- [ ] T026 [P] [US2] Integration test: `library_entries` scoping, cross-user `book-not-found`, shared-corpus instant reuse, concurrent-first-add exactly-once (deterministic idempotency key), and per-user concurrency cap (429) in `apps/api/src/application/library/library-isolation.integration.test.ts`.
- [ ] T027 [P] [US2] Integration test: per-user spoiler-cap SQL clause (no post-cap citations) and `getChunk` membership authorization in `apps/api/src/application/library/spoiler-and-citation.integration.test.ts`.
- [ ] T028 [P] [US2] E2E (Playwright + axe): two-user library isolation, instant re-add, and spoiler cap persisting across "devices" in `apps/web/__tests__/e2e/library-isolation.spec.ts`.

### Implementation for User Story 2

- [x] T029 [P] [US2] Added the `library_entries` Drizzle schema in `packages/db/src/schema/library_entries.ts` (text `user_id` FK, uuid `book_id` FK, `added_at`, `deleted_at`, `UNIQUE(user_id,book_id)`, partial cursor index, `book_id` index) + export. Generated + applied migration `0009_library_and_preferences` (consolidated with T030).
- [x] T030 [P] [US2] Added the `user_book_preferences` Drizzle schema in `packages/db/src/schema/user_book_preferences.ts` (text `user_id` FK, uuid `book_id` FK, `spoiler_cap_chapter int NULL`, `UNIQUE(user_id,book_id)`) + export. Included in migration `0009_library_and_preferences` (applied + verified in Postgres).
- [x] T031 [US2] Implement `LibraryEntryRepository.port.ts` + membership queries in `packages/catalog/src/infrastructure/persistence/DrizzleBookRepository.ts` (resolve-or-create by `gutendex_id`, list JOIN `library_entries` with cursor on `added_at`, membership upsert/soft-delete/restore, per-user in-flight count). `countInFlight` narrowed to actively-ingesting statuses (excludes `discovered`) so the cap is off-by-one-free.
- [x] T032 [US2] User-scope the catalog application fns in `packages/catalog/src/application/` (`addBookToLibrary`, `listLibrary`, `getBook`, `removeBook`, `restoreBook`) to take `userId`, make add idempotent (drop `DuplicateBookError`, return a needs-ingest flag), and update exports in `packages/catalog/src/index.ts`. 5 app-fn tests rewritten with a mocked `LibraryEntryRepository`.
- [x] T033 [US2] User-scope `apps/api/src/infrastructure/http/routes/library.ts` (read `userId` from `requireAuth`) and auto-enqueue ingestion with a deterministic `Idempotency-Key: ingest-{bookId}` (pg-boss `singletonKey`) only when the shared status is `discovered`. `auth`/`libraryRepo`/`concurrencyLimit` added to `LibraryRouteDeps`; `main()` wired with `DrizzleLibraryEntryRepository`.
- [x] T034 [US2] Add the per-user concurrency cap + membership authorization in `apps/api/src/application/library/{ingest,retryIngest,getIngestionStatus,getChunk}.ts`, and register the `ingestion-concurrency-limit` (429 + `Retry-After`) slug in `problem.ts`.
- [ ] T035 [US2] Implement the preferences application service in `apps/api/src/application/preferences/` and routes `apps/api/src/infrastructure/http/routes/preferences.ts` (GET caps by `book_ids`, PUT one cap; `userId` from session; Zod envelope), reusing the `spoiler_caps` shape via a new `packages/shared/src/schemas/preferences.ts`.
- [ ] T036 [US2] Rewrite `apps/web/src/lib/spoiler-cap.ts` to read/write the preferences API via TanStack Query (per-book, account-scoped) and update `apps/web/src/components/chat/ThreadHeader.tsx` (drop `threadId` from the cap key) and `DialogusThread.tsx` (source caps from the API).
- [ ] T037 [US2] Harden spoiler-cap delivery: inject the authenticated user's caps into retrieval structurally via the US1 Mastra proxy `requestContext` / tool default args in `apps/web/src/app/api/agents/dialogusAgent/stream/route.ts` so the SQL cap cannot be bypassed by a non-compliant model (depends on T019).
- [ ] T038 [US2] Update `apps/web/src/components/library/AddGutendexSheet.tsx` and `apps/web/src/lib/api/library.ts`: drop the gutendex duplicate-detection/manual-restore workaround, scope remove/restore to the user, and auto-start ingestion only when the returned status is `discovered`.
- [ ] T039 [US2] FR-022 guard: confirm no code path lists `books` globally so leftover single-user titles (no `library_entries`) never surface to any user; add an assertion/test in `apps/api/src/application/library/library-isolation.integration.test.ts`.

**Checkpoint**: US1 + US2 work independently — private conversations and per-user libraries over one shared corpus.

---

## Phase 5: User Story 3 - Invite-only onboarding controlled by the owner (Priority: P2)

**Goal**: Only owner-authorized identifiers can create accounts; the owner can invite, list access, and revoke; unauthorized attempts are rejected and recorded.

**Independent Test**: Authorize an email → accept-invite → sign in; a non-authorized email is rejected and audited; revoking a user invalidates their sessions; removing/demoting the only admin is refused.

### Tests for User Story 3 (per Constitution Principle II) ⚠️

- [ ] T040 [P] [US3] Integration test: invitation state machine (pending→used/revoked/expired), unauthorized sign-up rejected + `security_events` row, single-use enforcement, revoke invalidates sessions, and last-admin guard in `apps/api/src/application/admin/invitations.integration.test.ts`.
- [ ] T041 [P] [US3] E2E (Playwright + axe): invite → accept-invite → sign-in, plus the admin invitations/members screens in `apps/web/__tests__/e2e/onboarding.spec.ts`.

### Implementation for User Story 3

- [ ] T042 [US3] Add the `invitations` and `security_events` Drizzle schema in `packages/db/src/schema/{invitations,security_events}.ts` (+ exports); generate migration `0011_invitations_and_security_events`.
- [ ] T043 [US3] Add the `databaseHooks.user.create.before` allowlist hook to the Better Auth instance (`apps/api/src/infrastructure/auth/`): look up the normalized email in `invitations`, reject + write `unauthorized_signup_attempt` when absent, mark the invitation `used` on success.
- [ ] T044 [US3] Wire Better Auth event hooks to write `security_events` for `account_created`, `sign_in`, `sign_in_failed`, and `access_revoked` in `apps/api/src/infrastructure/auth/`.
- [ ] T045 [US3] Implement admin application services in `apps/api/src/application/admin/` (create/list/revoke invitation; list members; revoke/restore/role) including the last-admin guard.
- [ ] T046 [US3] Add admin routes in `apps/api/src/infrastructure/http/routes/admin/` behind `requireAdmin` (cursor pagination + Zod envelopes) and register the `invitation-invalid` (409/410) and `last-admin` (409) slugs in `problem.ts`.
- [ ] T047 [US3] Send the invitation email through the `sendEmail()` port (from T011) when an invitation is created, with the accept-invite link built from `APP_URL`, in `apps/api/src/application/admin/createInvitation.ts`.
- [ ] T048 [US3] Build the accept-invite page `apps/web/src/app/(auth)/accept-invite/page.tsx` and the admin UI (invitations + members lists with invite/revoke/role actions) using shadcn/ui + Tailwind tokens, keyboard-accessible.

**Checkpoint**: US1 + US2 + US3 — controlled onboarding over isolated workspaces.

---

## Phase 6: User Story 4 - Account and session management (Priority: P2)

**Goal**: Sessions stay valid across visits/devices, expire safely, and a user who can't sign in can recover access.

**Independent Test**: Two devices have independent sessions; a session past its limit forces re-auth preserving context; a forgot-password flow (mock email link) restores access via a single-use, expiring token.

### Tests for User Story 4 (per Constitution Principle II) ⚠️

- [ ] T049 [P] [US4] Integration test: session inactivity/max-age expiry, password-reset single-use + expiring token, and independent multi-device sessions in `apps/api/src/infrastructure/auth/session-lifecycle.integration.test.ts`.
- [ ] T050 [P] [US4] E2E (Playwright + axe): forgot → reset-password journey using the mock email link scraped from logs in `apps/web/__tests__/e2e/password-reset.spec.ts`.

### Implementation for User Story 4

- [ ] T051 [US4] Configure session inactivity + `SESSION_MAX_AGE_SECONDS` expiry on the Better Auth instance in `apps/api/src/infrastructure/auth/auth.ts`.
- [ ] T052 [US4] Implement password reset: `sendResetPassword` via the email port, the request-reset page `apps/web/src/app/(auth)/reset-password/page.tsx`, and a reset-confirm view calling `resetPassword({ token, newPassword })`.
- [ ] T053 [US4] Add session-expiry UX in `apps/web` (redirect to `/sign-in` preserving the return path; re-authenticate without losing the workspace context the user returns to) in `apps/web/src/middleware.ts` + the auth client.
- [ ] T054 [US4] Verify and cover multi-device behavior (signing out one device leaves others working) in `apps/web/src/lib/auth-client.ts` (with `T049` integration support).

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cross-cutting requirements and release hygiene spanning all stories.

- [ ] T055 [P] Account deletion (FR-023): an admin/self endpoint that cascades removal of `session`/`account`/`library_entries`/`user_book_preferences`, anonymizes `security_events`, and deletes the user's Mastra threads by `resourceId` via the Mastra API — with an integration test asserting the shared corpus and other users are untouched (`apps/api/src/application/admin/account-deletion.integration.test.ts`).
- [ ] T056 [P] Write ADRs under `.compozy/tasks/001-multi-user-auth/adrs/` for the auth-library choice, the RFC 9457 `/api/auth/*` exemption (E1), and the Mastra table-ownership boundary (E2).
- [ ] T057 [P] Update `README.md` and `.env.example` with the auth/email setup, the single-origin deployment model, the mock email mode, and the owner-seed step.
- [ ] T058 Finalize cookie/CORS config for prod single-origin vs the documented cross-origin dev fallback in `apps/api/src/index.ts` and the Better Auth instance.
- [ ] T059 [P] Add unit tests (Vitest) for env validation, email-provider selection, invitation state machine, last-admin guard, and idempotent membership add under the relevant package `__tests__`/`*.test.ts`.
- [ ] T060 Run all `quickstart.md` scenarios (1–8) end-to-end and confirm Lighthouse a11y ≥ 0.9 + zero axe violations on `/`, `/library`, and `/sign-in`.
- [ ] T061 Ensure the pre-commit gate (`pnpm lint && pnpm typecheck && pnpm test`) and the 6-job CI matrix are green.
- [ ] T062 [P] SC-006 validation: simulate ≥10 concurrent authenticated users exercising chat streaming + library reads and assert zero cross-user visibility under load and no errors in `apps/web/__tests__/e2e/concurrency-isolation.spec.ts` (the "no perceptible degradation" aspect is a qualitative/manual streaming-latency check noted in the test).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **blocks all user stories**.
- **User Stories (Phase 3–6)**: all depend on Foundational. By priority: US1 (P1) → US2 (P1) → US3 (P2) → US4 (P2). US1 and US2 are largely independent after Foundational (only T037 in US2 depends on US1's Mastra proxy T019); US3 and US4 depend only on Foundational.
- **Polish (Phase 7)**: depends on the desired stories being complete (T055 spans US1–US3 data; T060/T061 need everything in scope).

### User Story Dependencies

- **US1 (P1)**: after Foundational. No dependency on other stories.
- **US2 (P1)**: after Foundational. Independent of US1 except T037 (structural spoiler injection) which needs US1's authenticated Mastra proxy (T019).
- **US3 (P2)**: after Foundational. Independent (owner-seed from T014 covers account creation needed by US1/US2 tests until US3 lands).
- **US4 (P2)**: after Foundational. Uses the email port (T011); otherwise independent.

### Within Each User Story

- Tests (listed first) are written and FAIL before implementation.
- Schema/migrations → repositories → application services → API routes → web.
- Story complete and independently testable before moving to the next priority.

### Parallel Opportunities

- Setup: T002, T003 in parallel.
- Foundational: T011, T012, T015 in parallel with the auth-instance chain (T005→T006→T007→T008→T009→T010); T004 first (config gates the rest).
- Once Foundational completes, **US1 and US2 can be built in parallel** by different developers (mind T037→T019).
- Within a story, all `[P]` test tasks run together, and schema tasks across different files (e.g. T029 ‖ T030, T042's two files) run together.

---

## Parallel Example: User Story 1

```bash
# Tests for US1 together:
Task: "Integration test thread isolation + listThreads regression (T016)"
Task: "E2E sign-in journey + axe a11y (T017)"

# After tests, the independent-file impl tasks:
Task: "Mastra server.auth in apps/mastra/src/index.ts (T018)"
Task: "Cache isolation in apps/web/src/lib/query-keys.ts (T022)"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Setup → 2. Phase 2: Foundational (CRITICAL — blocks all) → 3. Phase 3: US1.
4. **STOP and VALIDATE**: seed two accounts, run the US1 independent test (private conversations, leak closed).
5. Deploy/demo the MVP.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → test → demo (MVP: private conversations).
3. US2 → test → demo (per-user libraries over the shared corpus + per-user spoiler caps).
4. US3 → test → demo (invite-only onboarding + access control).
5. US4 → test → demo (session lifecycle + account recovery).
6. Polish (account deletion, ADRs, docs, full quickstart + CI green).

### Parallel Team Strategy

After Foundational: Dev A → US1, Dev B → US2 (coordinate T037 with US1's T019), Dev C → US3, Dev D → US4. Stories integrate independently.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- `[Story]` labels map tasks to spec user stories for traceability.
- Better Auth `/api/auth/*` stays exempt from problem+json (E1); Mastra tables stay framework-owned (E2) — see `plan.md` Complexity Tracking.
- Migrations are numbered in build order: `0008_auth_core` (Foundational), `0009_library_entries` + `0010_user_book_preferences` (US2), `0011_invitations_and_security_events` (US3).
- Commit after each task or logical group; keep each commit lint/typecheck/test green.
- Stop at any checkpoint to validate a story independently.
