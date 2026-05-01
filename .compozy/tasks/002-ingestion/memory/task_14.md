# Task Memory: task_14.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Wire `POST /api/library/books/:id/ingest`, `GET /api/library/books/:id/ingestion`, `POST /api/library/books/:id/ingest/retry`, `GET /api/library/chunks/:id` in apps/api with guards + idempotency + envelope responses.

## Important Decisions

- Created `apps/api/src/infrastructure/http/routes/library.ts` from scratch. Feature 001 task_14 was marked completed in its task file but the route file was never committed; the catalog CRUD routes still need to land. This file currently contains only the four ingestion routes — Feature 001 task_14 must merge its five catalog routes into the same file.
- Did not add `@hono/zod-validator`. The task spec references it as "established in Feature 001," but Feature 001 task_14 was never committed. Inline `idParamSchema.parse(c.req.param())` lets `ZodError` flow through the existing problem middleware, which already maps it to `validation-failed` (400). One less dep, same outcome.
- New API-layer error classes live in `apps/api/src/application/library/errors.ts` (not in `@dialogus/ingestion`/`@dialogus/catalog`). They model HTTP-state-guard violations and chunk-not-found, which are concerns of the API layer rather than the domain. Codes match the existing `INGESTION_ERROR_CODE_TO_SLUG` map in `problem.ts`, so no middleware change was needed.
- `getChunk` does an inline Drizzle join (`chunks` ⋈ `chapters`) instead of adding `chunkRepo.findByIdWithChapter`. Keeps `ChunkRepository` port surface stable for tasks that only need single-row reads; the join is a single SELECT in the API use case.
- `IngestionStatusDto.error` parsed from `books.ingestion_error` using the worker convention `<slug>: <message>` (per shared workflow memory). Retryability is derived from a small allowlist (`download`, `embed`, `summarize`).
- Removed the `does NOT contain an application/ folder (introduced in Feature 001)` assertion in `apps/api/__tests__/scaffold.test.ts`. Foundation-era invariant no longer holds now that this task introduces `src/application/library/`. The matching `domain/` assertion was kept (no domain folder added).

## Learnings

- Drizzle pg-core tables don't expose `_.name` on user-facing JS objects; use `getTableName(table)` from `drizzle-orm` to identify a table inside a fake-`db.select` chain.
- Hono catches handler exceptions and assigns them to `c.error`. The existing problem middleware (`await next(); inspect c.error`) maps thrown `DialogusError` subclasses by code, so use cases can throw freely.
- The idempotency middleware reads `await c.req.json()` once. For empty-body POSTs (`POST /ingest`, `POST /ingest/retry`) the body resolves to `null`, hashes to `74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b` (sha256 of `"null"`). Replay tests use that constant.

## Files / Surfaces

- `apps/api/package.json` (added `@dialogus/ingestion` workspace dep).
- `apps/api/src/infrastructure/http/routes/library.ts` (new — 4 routes, factory `createLibraryRoute(deps)`).
- `apps/api/src/application/library/{errors,ingestionStatus,ingest,getIngestionStatus,retryIngest,getChunk}.ts` (new).
- `apps/api/__tests__/routes/library-ingestion.test.ts` (new — 14 cases).
- `apps/api/__tests__/scaffold.test.ts` (relaxed Foundation-era `application/` assertion).

## Errors / Corrections

- Initial fake-`db` distinguished tables via `tbl._.name`; that field is undefined on Drizzle objects. Switched to `getTableName(tbl)`.

## Ready for Next Run

- task_15 (worker handler registration) is unblocked. The route file imports `enqueue` from `apps/api/src/infrastructure/pgboss/enqueue.ts`; the worker just needs to register stage handlers on the same queue names (`ingestion.<stage>`).
- task_17 (apps/web landing) is unblocked for the `GET /api/library/books?status=ready` half once Feature 001 task_14 completes — the ingestion endpoints in this task do not affect that read path.
- Feature 001 task_14 outstanding work: when it merges the five catalog CRUD routes (`POST /books`, `GET /books`, `GET /books/:id`, `DELETE /books/:id`, `POST /books/:id/restore`), they go into the existing `library.ts` factory next to the four ingestion routes. The factory already accepts `db` + `logger` + `enqueueDeps`; extending its `LibraryRouteDeps` shape with the catalog use cases is straightforward.
