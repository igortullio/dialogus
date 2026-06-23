# Quickstart & Validation: Multi-User Accounts & Per-User Data Isolation

**Feature**: `001-multi-user-auth` | **Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Data model**: [data-model.md](./data-model.md) · **Contracts**: [contracts/](./contracts/)

Runnable scenarios that prove the feature works end-to-end. Each maps to user
stories and success criteria. Implementation details live in `tasks.md` and the
code; this is a run/validation guide.

## Setup

```bash
docker compose up -d           # Postgres 18 + pgvector
pnpm db:migrate                # applies 0008–0011 (auth_core → user_book_preferences)
pnpm dev                       # web :3000 + api :3001 + mastra :3002 + worker
```

New environment (in `.env`, validated by the `@dialogus/shared` Zod schema):

```bash
BETTER_AUTH_SECRET=<random-32B+>     # required in prod
APP_URL=http://localhost:3000        # canonical base URL / trusted origin
AUTH_TRUSTED_ORIGINS=http://localhost:3000
EMAIL_PROVIDER=mock                  # mock logs the invite/reset link; 'resend' for real sends
# RESEND_API_KEY=...                 # required when EMAIL_PROVIDER=resend or NODE_ENV=production
# EMAIL_FROM="dIAlogus <noreply@yourdomain>"
INGESTION_USER_CONCURRENCY_LIMIT=2
SESSION_MAX_AGE_SECONDS=604800
```

With `EMAIL_PROVIDER=mock`, invitation and reset links are printed to the API/worker
logs (line `email_provider_selected` on boot; `email_sent` with the URL) so the
whole flow runs offline / in CI.

**Bootstrap the first owner** (invite-only blocks self-service):

```bash
pnpm --filter @dialogus/api seed:owner -- --email owner@example.com --password '<pw>'
# uses Better Auth server-side createUser with role=admin (one-off; see contracts/admin-invitations.md)
```

---

## Scenario 1 — Invite-only onboarding (US3 · FR-014/016 · SC-005)

1. Sign in as the owner; `POST /api/admin/invitations { email: "ana@example.com" }`.
2. Open the mock invite link from the logs → complete sign-up → land authenticated.
3. **Expect**: a non-invited email (`mallory@example.com`) attempting sign-up is
   rejected (`invitation-invalid`) and a `security_events` row
   `unauthorized_signup_attempt` is written. ✅ only authorized identifiers create
   accounts.

## Scenario 2 — Auth gating & sessions (US1/US4 · FR-001/004/018/020)

1. Hit `/` while signed out → redirected to `/sign-in`.
2. Sign in → workspace renders. Sign out → `/` redirects again.
3. Sign in on a second browser → both sessions work independently (FR-020).
4. Expire a session (wait past `SESSION_MAX_AGE_SECONDS` or delete the `session`
   row) → next request redirects to `/sign-in`, preserving the return path.

## Scenario 3 — Conversation isolation (US1 · FR-006 · SC-002)

1. As User A, create a thread "Dostoiévski" and send a message.
2. Sign in as User B → thread list is **empty**.
3. As User B, request User A's thread by id (direct `GET`/stream) → `404`.
4. **Regression check (the live leak)**: confirm `listThreads` now sends
   `resourceId` and the Mastra port is **not** reachable directly from the
   browser. ✅ zero cross-user thread visibility.

## Scenario 4 — Shared corpus + per-user library (US2 · FR-007/010–013 · SC-003/004)

1. As User A, add a Gutendex title → ingestion runs once → status `ready`.
2. As User B, add the **same** title → appears `ready` in **< 5s**, **no** new
   ingestion pipeline runs (check worker logs / `idempotency_keys`). (SC-003/004)
3. As User B, remove the title → User B's library drops it; **User A still has it**
   and its chapters/chunks remain (FR-013).
4. Direct-id `GET /api/library/books/:id` for a title not in the caller's library
   → `book-not-found` (SC-002).
5. **Concurrent first-add**: two users add a brand-new title simultaneously →
   exactly one ingestion enqueued (deterministic `Idempotency-Key`), both end up
   `ready` (FR-012).

## Scenario 5 — Account-scoped spoiler caps (FR-008/009 · SC-008)

1. As User A on device 1, set a spoiler cap on a book (chapter N).
2. Sign in as User A on device 2 → the same cap is shown (account-scoped).
3. Ask a question that would cite beyond chapter N → no post-cap citations (the SQL
   clause still enforces it). ✅ caps follow the user; spoiler contract holds.

## Scenario 6 — Revocation (US3 · FR-015 · SC-007)

1. Owner `POST /api/admin/members/:id/revoke` for User B.
2. User B's next request → unauthenticated (sessions invalidated); cannot reach any
   data. Revoke completes in **< 1 min** (SC-007).
3. Attempt to revoke/demote the only admin → `last-admin` (FR-017).

## Scenario 7 — Account deletion (FR-023)

1. Delete User B's account.
2. **Expect**: User B's `library_entries`, `user_book_preferences`, sessions
   removed; their Mastra threads deleted by `resourceId`; `security_events`
   anonymized/removed. The shared corpus and **User A's** data are untouched.

## Scenario 8 — Abuse & cost limits (FR-021)

1. Hammer `POST /api/auth/sign-in/email` with wrong passwords → `429 rate-limited`
   after the configured threshold (counter persists across processes — DB storage).
2. Kick off more than `INGESTION_USER_CONCURRENCY_LIMIT` ingestions as one user →
   `429 ingestion-concurrency-limit` + `Retry-After`; other users unaffected.

---

## Automated coverage (per Constitution Principle II)

- **Unit (Vitest)**: env-schema validation; email-provider selection
  (`mock`/`resend` + production guard); membership resolve-or-create + idempotent
  add; per-user concurrency count; invitation state machine; last-admin guard.
- **Integration (Testcontainers, real Postgres/pgvector/pg-boss)**: auth tables +
  sessions; `library_entries` scoping & cross-user `book-not-found`; shared-corpus
  dedup + concurrent-first-add exactly-once; DB-backed rate limiting; spoiler-cap
  SQL clause per user; account-deletion cascades.
- **E2E (Playwright + axe-core)**: sign-in/sign-up/reset journeys; two-user
  conversation & library isolation; spoiler-cap across "devices"; sign-in,
  `/library`, `/` keep Lighthouse a11y ≥ 0.9 with zero axe violations and full
  keyboard nav.
