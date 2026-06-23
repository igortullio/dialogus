# Handoff — feature `001-multi-user-auth`

Resume note so a fresh session can pick up without re-deriving anything.

## Current state (branch `001-multi-user-auth`)

Working tree is **green** (`pnpm lint && pnpm -r typecheck && pnpm -r test` all pass).
Commits so far (newest first):

```
feat(library): US2 LibraryEntryRepository — membership-aware queries (T031)
feat(library): US2 data layer — library_entries + user_book_preferences (T029/T030)
test(auth):    US1 isolation tests + Mastra defense-in-depth (T016-T018)
feat(auth):    US1 conversation isolation via authenticated thread proxy
feat(auth):    Better Auth foundation + US1 sign-in gate
docs(...):     spec, plan, research, data-model, contracts, tasks
```

- **Foundational (T001–T015)** ✅ committed, runtime-validated (migration `0008`, owner seed, sign-in/session/invite-only).
- **US1 — login + conversation isolation (T016–T025)** ✅ **complete**, validated live (auth gate, authenticated thread proxy, leak closed, Mastra `server.middleware` hardening).
- **US2 — data + repository (T029–T031)** ✅ committed (migration `0009` applied; `LibraryEntryRepository` implemented).
- **US2 — catalog app fns + API route/main (T032–T034)** ✅ **done** — catalog fns user-scoped + idempotent add (`{book, needsIngestion}`, no more `DuplicateBookError`); `/api/library` gated by `requireAuth` via `createLibraryRoute` (Step 3 test-auth pattern = stub `fakeAuth(userId)` for unit + real `user` row via `createTestUser` for Testcontainers); deterministic `ingest-{bookId}` pg-boss `singletonKey`; membership auth on ingest/retry/status/chunk; per-user concurrency cap (`429 ingestion-concurrency-limit`). All ~8 API test files updated; gate green (`pnpm lint && pnpm -r typecheck && pnpm -r test`) + all 4 Testcontainers integration suites pass.
- **US2 — web + spoiler caps (T035–T039)** ✅ **done** — account-scoped spoiler-caps API (`/api/preferences/spoiler-caps`, membership-gated PUT); web `spoiler-cap.ts` is now API-backed per-book (`useSpoilerCap(bookId)`, TanStack Query, optimistic) with `readAllSpoilerCaps`/`clearSpoilerCapsForThread` gone; the stream proxy sources caps server-side (session-authoritative, T037); `AddGutendexSheet` dropped the duplicate workaround + client auto-ingest (T038); FR-022 guard added (T039). Gate green incl. all web unit tests.
- **US2 — isolation tests (T026–T028)** ✅ **done** — `library-isolation.integration.test.ts` (scoping, cross-user 404, instant reuse, concurrent-first-add exactly-once, per-user 429); the spoiler-cap SQL clause via `find_character_mentions` in mastra's `spoiler-cap.integration.test.ts` + `getChunk` cross-user 404 in `chunks-read.integration.test.ts`; and `apps/web/__tests__/integration/library-isolation.spec.ts` (two-user E2E + axe, typecheck-validated). **US2 is now fully complete (T026–T039).** US3, US4 untouched.
- **Hardening landed with T026**: `addBookToLibrary` is now race-safe for concurrent first-adds (catches the `gutendex_id` unique violation and refetches the winner), so two users adding the same new title concurrently get one shared book + one deterministic ingest job.

> Notes for the next session:
> - `addBook` is idempotent server-side (`201` on re-add; never `409 duplicate-gutendex-id`); the server auto-ingests on `discovered`. `DuplicateBookError` + its `duplicate-gutendex-id` problem mapping are now **dead code** (kept) — safe to delete in a cleanup pass (also the orphaned `BookRepository.list`).
> - API `GET /library/books/:id` for a removed/non-member book returns `book-not-found` (per-user "removed" lives in `library_entries.deleted_at`, never the book DTO's `deleted_at`).
> - T037 is the **server-authoritative-prefix** form (the proxy fetches the user's caps and overrides client values). A non-compliant *model* can still drop caps from tool args; the fully-structural fix (Mastra `runtimeContext`/tool default args so the SQL cap is set out-of-band) is a noted follow-up.
> - Local Testcontainers caveat: under OrbStack, `library.integration.test.ts`'s MSW `onUnhandledRequest: 'error'` intercepts the Docker socket and breaks runtime detection. Run integration suites with `DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock TESTCONTAINERS_RYUK_DISABLED=true pnpm --filter @dialogus/api test:integration`; the MSW-bearing suite needs `'bypass'` to run locally (CI's native Docker is unaffected). The gate (`pnpm test`) runs unit only.

Single source of truth for remaining work: **`specs/001-multi-user-auth/tasks.md`** (checkboxes).

## Dev setup to resume

```bash
docker compose up -d
pnpm db:migrate        # applies 0008 + 0009
pnpm --filter @dialogus/api seed:owner -- --email owner@dialogus.test --password 'OwnerPass123!'
pnpm dev
```

A test owner `owner@dialogus.test` / `OwnerPass123!` already exists in the dev DB.

## Next up — US3: invite-only onboarding + access control (T040–T048)

Owner-controlled onboarding: only allowlisted emails can create accounts; the
owner can invite/list/revoke; unauthorized attempts are rejected **and audited**;
revoking invalidates sessions; the last admin can't be removed/demoted.
Single source of truth: `tasks.md` Phase 5 (T040–T048) + `contracts/admin-invitations.md`.

### Already in place to build on (don't rebuild)
- **Admin plugin** is on the Better Auth instance: `admin({ defaultRole: 'member', adminRoles: ['admin'] })` (`apps/api/src/infrastructure/auth/auth.ts:99`). `disableSignUp: true` is set — the `user.create.before` hook is the allowlist gate.
- **`requireAdmin()`** middleware already exists (`apps/api/src/infrastructure/http/middleware/auth.ts`) — 401 if no `userId`, 403 if `userRole !== 'admin'`. Apply it to the admin route group exactly like `requireAuth()` is applied in `routes/library.ts`/`preferences.ts`.
- **Email port** `sendEmail()` + `selectEmailProvider` (mock/Resend) landed in Foundational (`apps/api/src/infrastructure/email/`) — T047 sends the invite link through it; mock mode logs the link (scrape it in tests).
- **Owner seed** server-side user creation pattern: `apps/api/src/infrastructure/auth/seed-owner.ts` (`auth.$context` → `internalAdapter.createUser/createAccount`).
- **Problem middleware**: add `invitation-invalid` (409/410) + `last-admin` (409) slugs in `apps/api/src/infrastructure/http/middleware/problem.ts` (mirror how `unauthorized`/`forbidden`/`ingestion-concurrency-limit` are mapped from typed `DialogusError`s).

### Migration number gotcha
US2 consolidated into **`0009_library_and_preferences`** (there is no `0010`). The
data-model text says "0011" but that assumed separate 0009/0010 — **run
`ls packages/db/drizzle` and use the next free number (likely `0010`)** for
`invitations` + `security_events`. Author as Drizzle schema then `pnpm db:generate`;
never run Better Auth's own migrate.

### Suggested order (tests first, per Constitution II)
1. **T040 / T041** write the failing integration + E2E tests first (invitation state machine pending→used/revoked/expired, unauthorized-signup → `security_events` row, single-use, revoke-invalidates-sessions, last-admin guard).
2. **T042** schema: `invitations` + `security_events` (`packages/db/src/schema/`) + migration.
3. **T043** `databaseHooks.user.create.before` allowlist hook on the auth instance (reject + write `unauthorized_signup_attempt` when the normalized email isn't an open invitation; mark the invitation `used` on success).
4. **T044** Better Auth event hooks → `security_events` (`account_created`, `sign_in`, `sign_in_failed`, `access_revoked`).
5. **T045** admin application services (create/list/revoke invitation; list members; revoke/restore/role) **with the last-admin guard**.
6. **T046** admin routes under `requireAdmin` (cursor pagination + Zod envelopes) + the two new problem slugs.
7. **T047** send the invite email via the `sendEmail()` port (accept-invite link from `APP_URL`).
8. **T048** `apps/web/src/app/(auth)/accept-invite/page.tsx` + the admin invitations/members UI.

### Reusable test infra from US2 (mirror these)
- `apps/api/__tests__/_helpers/auth.ts` — `fakeAuth(userId, role)` (pass `'admin'` for admin-route unit tests) and `headerAuth({...})` for multi-user; `requireAdmin` reads `userRole`.
- `apps/api/__tests__/integration/_helpers/setup.ts` — `startPostgres`, `createTestUser(db, { id, role })`, `addLibraryMembership`, `dockerAvailable`.
- Gate: `pnpm lint && pnpm -r typecheck && pnpm -r test` (unit; the pre-commit hook also runs it). Testcontainers run via `pnpm --filter @dialogus/api test:integration`.
- **Local OrbStack caveat**: MSW `onUnhandledRequest: 'error'` breaks Testcontainers' Docker-socket detection; run integration with `DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock TESTCONTAINERS_RYUK_DISABLED=true`, and temporarily flip an MSW suite to `'bypass'` to run it locally (CI's native Docker is fine with `'error'`).

## How to kick off the next session

> "Continue feature 001-multi-user-auth from HANDOFF.md — implement US3
> (invite-only onboarding + access control, T040–T048). Write the failing
> invitation/state-machine + last-admin tests first, then schema+migration →
> allowlist & event hooks → admin services → admin routes → invite email →
> accept-invite + admin UI. Keep the gate green and commit per logical group."

Then read `HANDOFF.md` + `tasks.md` (Phase 5) + `contracts/admin-invitations.md` + `data-model.md` and proceed.

### Status snapshot (for the resuming session)
Foundational (T001–T015) ✅ · US1 (T016–T025) ✅ · **US2 (T026–T039) ✅** · **US3 (T040–T048) ✅** · **US4 (T049–T054) ✅** · **Polish (T055–T062) ✅ (T060/T062 live-stack/CI-validated)**
Polish commits: `20f9765` account-deletion API + cascade test, `391c6f0` admin delete UI, `c441f2d` ADRs + README + reset rate-limit, `a6cca9b` T059 coverage + T062 concurrency E2E.
**Feature 001-multi-user-auth is functionally complete.** Remaining are live-stack validations: the full `quickstart.md` 1–8 run + Lighthouse a11y (T060) and the ≥10-user concurrency E2E (T062) — both authored + typecheck-validated, executed in CI / manual. Open follow-ups (low risk, documented): rate-limit the Hono `/api/invitations/accept` endpoint; the last-admin guard is read-then-write (TOCTOU under simultaneous admin requests); admin panels render only the first page (server paginates); the pre-existing intermittent web-test flake under the all-package concurrent pre-commit run.

#### Account-deletion adversarial review — fixed vs deferred (commit after `be0adf6`)
A review of the FR-023 code confirmed 6 findings. **Fixed**: (HIGH) `MastraThreadDeleter` parsed the list response as a bare array, but Mastra returns a paginated object `{ threads, hasMore, … }` — it was a **silent no-op that deleted ZERO threads**; now parses `.threads` and follows `hasMore` pagination (the unit test had mocked the wrong shape, which is why it passed — fixed to the real shape). (MED) added the pagination loop. (LOW) `DELETE /api/admin/members/:id` now refuses **self-deletion** from the console (403); integration test extended to actually insert + assert the `account` cascade and the `invitations.invited_by` SET-NULL path (previously unverified). **Deferred (low)**: the `DeleteMemberDialog` confirm closes and the member row unmounts on success, so Radix restores focus to the now-removed trigger → focus falls to `<body>` (an a11y focus-management gap; the static `/admin` axe check doesn't catch it). Fix by moving focus to a stable element (e.g. the members heading) after a successful delete.

(US3: `bcf462e` allowlist+services+hooks, `c69970f` admin/accept routes, `4ec46b8` accept-invite+admin UI, `5a67eb2` review remediation.
US4: `96e7ae4` session lifecycle + sliding inactivity, `fbd0f13` reset-password flow + proxy exclusions). Polish (T055–T062) ⬜.

#### US4 notes for the next session
- **Reset URL shape**: Better Auth emails `${baseURL}/reset-password/<token>?callbackURL=<redirectTo>` (token is a PATH segment). Clicking it hits Better Auth's GET endpoint, which redirects to `<redirectTo>?token=<token>` (or `?error=INVALID_TOKEN`). The web `reset-password` page reads `?token=`/`?error=`. The integration test scrapes the path token directly.
- **Session model**: sliding inactivity via `session.expiresIn` (= `SESSION_MAX_AGE_SECONDS`) + `updateAge` (refresh granularity, capped at 1 day). There is **no** separate absolute-max-age-regardless-of-activity cap — add one if the spec later demands it.
- **Route gate** (`apps/web/src/proxy.ts`) excludes `sign-in`, `reset-password`, `accept-invite`, `api`, Next internals. Adding any new public (signed-out) page means adding it to that matcher.
- **Reset is NOT yet rate-limited** beyond Better Auth's global `rateLimit` (100/60s); the `customRules` only tighten `/sign-in/email`. FR-021 polish (T058/Polish) should add tighter `customRules` for `/request-password-reset` and the accept endpoint.
- Run: `TESTCONTAINERS_RYUK_DISABLED=true pnpm --filter @dialogus/api test:integration session-lifecycle` (no MSW).

#### US3 notes for the next session
- **Migration is `0010_invitations_and_security_events`** (not `0011` — US2 consolidated into `0009`). data-model §6 still says 0011; it's `0010`.
- **Invite-only model**: `disableSignUp:true` stays; `/sign-up/email` is fully disabled. Accounts are created **server-side** (owner seed + `POST /api/invitations/accept` → `createMemberAccount` → `internalAdapter.createUser`), which DOES run the `databaseHooks` allowlist gate. The before-hook **exempts `role:'admin'`** so the owner seed isn't blocked. To exercise the `unauthorized_signup_attempt` audit, attempt a member `internalAdapter.createUser` for a non-invited email (see the integration test).
- **AdminRepository port** (`apps/api/src/application/admin/ports.ts`) backs both the hooks and the admin services → services/hooks are unit-tested vs an in-memory fake (`__tests__/_helpers/fakeAdminRepo.ts`); `DrizzleAdminRepository` is covered by the Testcontainers suite.
- **Accept token** = the invitation `id` (uuid v4, unguessable); the email link is `${APP_URL}/accept-invite?invitation={id}`. `GET /api/invitations/:id` exposes only the email+status for an *open* invite; non-open → `invitation-invalid` (410).
- **Follow-ups**: `/api/invitations/accept` is NOT yet rate-limited (Better Auth's rateLimit only covers `/api/auth/*`) — FR-021 polish. `sign_in_failed` audit deferred to US4. `expired` is computed lazily (open = pending AND `expires_at > now()`); no row is flipped to `expired` (a sweeper is optional).
- Run the US3 integration test: `TESTCONTAINERS_RYUK_DISABLED=true pnpm --filter @dialogus/api test:integration admin-invitations` (no MSW, so the OrbStack socket caveat doesn't apply).

#### US3 adversarial review — fixed vs deferred
A multi-agent review of the US3 diff surfaced 16 confirmed findings. **Fixed** (committed): the Better Auth admin-plugin REST endpoints (`/api/auth/admin/*`) are now **blocked at the mount** (they bypassed the last-admin guard + allowlist); re-inviting an expired-but-pending email now lazily flips stale `pending→expired` + translates the unique-violation to `invitation-conflict` (was a raw 500); the shared cursor `id` accepts non-UUID text so `/api/admin/members` page-2 works (was `400 invalid-cursor`); the invitations `next` link preserves `?status`; a Better-Auth `APIError` during accept maps to `invitation-invalid` (410) not 500; `consumeInvitationByEmail` only consumes an *open* invite; MembersPanel shows a last-admin-specific vs generic message and clears the error banner on success; accept-invite loading/invalid phases announce to AT.
**Deferred follow-ups (documented, not yet fixed)**:
  - **Last-admin guard is read-then-write (TOCTOU)** — two concurrent revoke/demote requests on *distinct* admins can both pass `countActiveAdmins()` and drop active admins to zero. Needs the count+mutation in one transaction with `SELECT … FOR UPDATE` (or a partial-unique/trigger invariant). Low practical risk at the owner+~10-user scale, but real.
  - **Admin panels render only the first page** — `fetchMembers/fetchInvitations` return `nextCursor` but neither panel paginates; >50 (default limit; max 100) rows are unreachable in the UI. Add a "load more"/cursor follow.
  - **Admins can revoke/demote themselves** — `listMembers` includes the requester with no "you" affordance; with ≥2 admins the last-admin guard doesn't fire, so self-demote/self-revoke is allowed. Product/UX decision (exclude self or add a confirm + "you" badge).
