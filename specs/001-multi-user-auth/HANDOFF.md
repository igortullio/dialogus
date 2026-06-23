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
- **US2 — app/API/web (T026–T028, T032–T039)** ⬜ remaining (see below). US3, US4 untouched.

Single source of truth for remaining work: **`specs/001-multi-user-auth/tasks.md`** (checkboxes).

## Dev setup to resume

```bash
docker compose up -d
pnpm db:migrate        # applies 0008 + 0009
pnpm --filter @dialogus/api seed:owner -- --email owner@dialogus.test --password 'OwnerPass123!'
pnpm dev
```

A test owner `owner@dialogus.test` / `OwnerPass123!` already exists in the dev DB.

## US2 remaining — the app→API→web cascade (do it as ONE coherent change)

This is why it wasn't finished in one pass: it touches the `@dialogus/catalog`
app fns + the `/api/library` route + `main()` + **~8 API test files** (unit +
Testcontainers integration that boot the app and make real HTTP calls). It must
land together with its tests.

### Step 1 — catalog app fns (T032), already designed & validated once
Change signatures to user-scoped + membership (the `LibraryEntryRepository` is
already committed). Target shapes:

- `addBookToLibrary(deps{repository,libraryRepo,client}, userId, gutendexId) → { book, needsIngestion }`
  — resolve-or-create shared book by gutendex_id (no more `DuplicateBookError`),
  `libraryRepo.upsertMembership(userId, book.id)`, `needsIngestion = status === 'discovered'`.
- `listLibrary(deps{libraryRepo}, userId, input) → libraryRepo.listForUser(...)`.
- `getBook(deps{repository,libraryRepo}, userId, id)` — `isActiveMember` else `BookNotFoundError`.
- `removeBook(deps{libraryRepo}, userId, id)` — `softRemove`; false → `BookNotFoundError`.
- `restoreBook(deps{repository,libraryRepo}, userId, id)` — `restore`; false → `BookNotFoundError`.

Then rewrite the 5 catalog app-fn tests (mock a `LibraryEntryRepository`; the
mock helper shape is in the git history of the reverted attempt if useful).

### Step 2 — API route + `main()` (T033/T034)
- `apps/api/.../routes/library.ts`: apply `createSessionMiddleware(auth)` +
  `requireAuth()` (need `auth` in `LibraryRouteDeps`), read `c.get('userId')`,
  thread it into every deps closure. On `POST /books`, if `needsIngestion`,
  auto-enqueue ingestion with a **deterministic** `Idempotency-Key: ingest-{bookId}`.
- Per-user concurrency cap (FR-021): before enqueue, `libraryRepo.countInFlight(userId)`
  >= `INGESTION_USER_CONCURRENCY_LIMIT` → 429 `ingestion-concurrency-limit` (+ slug in `problem.ts`).
- Membership authorization on `ingest`/`retry`/`ingestion-status`/`getChunk`
  (don't leak another user's chunk/status — SC-002).
- `main()`: build `new DrizzleLibraryEntryRepository(db)`, pass `auth`, make the
  deps closures `(userId, ...) => appFn({repository, libraryRepo, client}, userId, ...)`.

### Step 3 — the test gotcha (this is the real blocker)
The ~8 API test files break once `/api/library` requires auth. Decide ONE auth
pattern for tests first, then apply everywhere:
- **Unit route tests** (`routes/library.test.ts`, `routes/library-ingestion.test.ts`):
  inject a fake/stub session middleware (or a test `auth` whose `getSession`
  returns a fixed user) so handlers get a `userId`.
- **Integration tests** (`integration/*.integration.test.ts`): add a sign-in
  helper that seeds an owner via Better Auth and obtains the session cookie, then
  send it on every request. (Mirror the web `__tests__/helpers/auth.ts` pattern.)

### Step 4 — web + spoiler caps (T035–T038) and FR-022 guard (T039)
- `preferences` API (GET/PUT spoiler caps) + rewrite `apps/web/src/lib/spoiler-cap.ts`
  from localStorage to the API; structural cap injection via the stream proxy.
- `AddGutendexSheet`/`lib/api/library.ts`: drop the gutendex duplicate workaround
  (add is idempotent now); auto-ingest only when returned status is `discovered`.
- Assert no code path lists `books` globally (leftover single-user books never
  surface — FR-022).

### Step 5 — tests T026–T028 (integration + E2E for two-user library isolation).

## How to kick off the next session

> "Continue feature 001-multi-user-auth from the HANDOFF.md — do the US2
> app→API→web cascade (T032–T039). Start by deciding the API test auth pattern
> (Step 3), then catalog app fns + route + main(), keeping the gate green."

Then I read `HANDOFF.md` + `tasks.md` + `plan.md` and proceed.
