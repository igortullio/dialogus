# Task Memory: task_14.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Implement 5 library CRUD routes in `apps/api/src/infrastructure/http/routes/library.ts` (task completed).

## Important Decisions

- `library.ts` already existed with ingestion routes (ingest, retry, ingestion status, chunks). The 5 CRUD routes were added to the same factory and `LibraryRouteDeps` extended with the new use-case callables as required fields.
- `library-ingestion.test.ts` was updated to add `vi.fn()` mocks for the 5 new CRUD deps — these mocks are never called during ingestion tests, preserving test behavior.
- Use-case deps are injected as pre-bound callables `(id) => useCase({ repository, client }, id)` rather than raw repository/client — this matches the task spec "route must not instantiate use cases" and makes unit tests clean.
- `enqueueDeps` remains required in `LibraryRouteDeps` (unchanged from existing interface).
- `meta.count` on GET /books uses `result.books.length` (page count, not total) — the `ListResult` interface does not include a total count field.

## Learnings

- The `idempotency` middleware is registered once at the top of `createLibraryRoute` and shared between POST /books and the existing POST /books/:id/ingest routes.
- For unit tests: mock the Drizzle DB select chain (`select → from → where → limit`) to simulate idempotency row lookups; for POST without `Idempotency-Key`, the middleware short-circuits before any DB access.
- `z.uuid()` on the id path param gives 400 validation-failed for non-UUID ids automatically via the problem middleware.
- `DrizzleBookRepository` uses `noUncheckedIndexedAccess` guard on `const [saved]` (uses `saved?` check or `if (!saved) throw`).

## Files / Surfaces

- Modified: `apps/api/src/infrastructure/http/routes/library.ts` (added 5 CRUD routes + toBookDto + extended LibraryRouteDeps)
- Modified: `apps/api/__tests__/routes/library-ingestion.test.ts` (added mock CRUD deps to buildApp)
- Created: `apps/api/__tests__/routes/library.test.ts` (14 unit tests for CRUD routes)
- Created: `apps/api/__tests__/integration/library.integration.test.ts` (full CRUD sequence, filters, 404)
- Created: `apps/api/__tests__/integration/cursor.integration.test.ts` (50-book pagination, mid-pagination stability)

## Errors / Corrections

- Biome flagged import ordering and long-line formatting in 3 new test files — fixed via `pnpm biome check --write`.

## Ready for Next Run

Task 14 is complete. Next is task_15 (pg-boss init + cleanup-idempotency-keys job).
