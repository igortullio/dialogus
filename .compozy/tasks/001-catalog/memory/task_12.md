# Task Memory: task_12.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

apps/api Idempotency-Key middleware implemented per ADR-003: opt-in factory `idempotency({ db, logger? })` reading `Idempotency-Key` header on POST routes, hashing canonicalized body via SHA-256, replaying cached 2xx responses with `X-Idempotency-Replay: true`, throwing `IdempotencyKeyConflictError` on hash mismatch. `canonicalizeBody` exported from the same file. Problem middleware extended to map the new error to 422 + slug `idempotency-key-conflict`.

## Important Decisions

- `canonicalizeBody` lives in `apps/api/src/infrastructure/http/middleware/idempotency.ts` for V1 per task spec (overrides ADR-003 note that it should live in `@dialogus/shared/http`).
- Integration test uses Testcontainers (`@testcontainers/postgresql@^11`, image `pgvector/pgvector:pg18`) and applies migrations via `drizzle-orm/postgres-js/migrator` directly (skipping `runMigrations` so pg-boss boot is avoided in the test).
- Refactored middleware into helpers (`buildReplayResponse`, `readResponseBody`) to satisfy Biome `noExcessiveCognitiveComplexity` (limit 15).
- Middleware reads `c.req.json()` once; Hono caches the parsed result so downstream handlers can also call `c.req.json()` without consuming the body twice.
- Response body capture uses `c.res.clone().text()` then `JSON.parse` with a text fallback; non-2xx responses skip the INSERT (failed handlers stay retryable).

## Learnings

- Root `vitest.config.ts` excludes `**/*.integration.test.ts` and the root `vitest.integration.config.ts` only globs `__tests__/**/*.integration.test.ts` (root tests dir). Until task_17 adds an apps/api-local config, integration tests under `apps/api/__tests__/integration/` are reached via `pnpm vitest run --config ./vitest.integration.config.ts --dir apps/api`.
- `apps/api/__tests__` did not previously have `integration/`; this task established the directory and the Testcontainers pattern (Docker availability gate via `spawnSync('docker', ['info', ...])` + `describe.skipIf(!dockerAvailable)`).

## Files / Surfaces

- `packages/shared/src/errors/index.ts` — added `IdempotencyKeyConflictError(key, message?)` with code `IDEMPOTENCY_KEY_CONFLICT`.
- `apps/api/src/infrastructure/http/middleware/idempotency.ts` — new middleware + `canonicalizeBody` helper.
- `apps/api/src/infrastructure/http/middleware/problem.ts` — added 422 mapping for `IdempotencyKeyConflictError` (slug `idempotency-key-conflict`).
- `apps/api/__tests__/middleware/idempotency.test.ts` — 10 unit tests (4 branches, no-store-on-500, canonicalize equivalence, log assertions).
- `apps/api/__tests__/middleware/problem.test.ts` — added one test for the 422 mapping.
- `apps/api/__tests__/integration/idempotency.integration.test.ts` — 5 Testcontainers integration tests (replay, canonicalize replay across key order, 422 conflict, no-store on 500, post-cleanup re-execution).
- `apps/api/package.json` — added `drizzle-orm` (dependency) + `@testcontainers/postgresql` (devDep).

## Errors / Corrections

- Initial middleware impl exceeded Biome cognitive complexity (16 vs max 15). Resolved by extracting `buildReplayResponse` + `readResponseBody` helpers and inverting the conflict branch to early-return.

## Ready for Next Run

Verification snapshot:
- `pnpm lint` clean (5 pre-existing warnings only — baseline).
- `pnpm typecheck` ok across all 5 workspace projects.
- `pnpm test` ok (53/53 in apps/api; 327/327 workspace-wide).
- `pnpm vitest run --config ./vitest.integration.config.ts --dir apps/api` ok (5/5 in ~2.5s after image is cached).
- Coverage on `idempotency.ts`: 92.45% statements / 89.28% branches / 100% functions / 93.61% lines.
