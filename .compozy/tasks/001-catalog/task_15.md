---
status: completed
title: apps/api pg-boss init + cleanup-idempotency-keys job
type: backend
complexity: medium
dependencies:
  - task_05
  - task_12
---

# Task 15: apps/api pg-boss init + cleanup-idempotency-keys job

> **Superseded in part by Feature 002 task_02** ([../002-ingestion/task_02.md](../002-ingestion/task_02.md), per [ADR-005](../002-ingestion/adrs/adr-005.md)). The pg-boss runtime client and the `catalog.cleanup-idempotency-keys` worker + schedule registration have migrated from `apps/api` to `apps/worker`. The handler body was moved to `apps/worker/src/handlers/catalog-cleanup-idempotency-keys.ts`; `apps/api/src/index.ts` no longer calls `boss.start`, `boss.schedule`, or `boss.work`. The route-side enqueue path now uses the transient helper at `apps/api/src/infrastructure/pgboss/enqueue.ts`.

## Overview

Extend `apps/api` boot to start a pg-boss client at runtime (not a migration — pg-boss schema already exists from Foundation `db:migrate`), wire up global middleware (problem, request-id, idempotency-opt-in support), register routes from tasks 13 and 14, and schedule the hourly cleanup job that deletes expired `idempotency_keys` rows.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST extend `apps/api/src/index.ts` to:
  - Start pg-boss via `const boss = createPgBoss(DATABASE_URL); await boss.start();` as a runtime client (per-process, idempotent; Foundation ADR-003 constrained only migration ownership, not runtime clients).
  - Register global Hono middleware: request-id (generates UUID `trace_id` per request, sets pino logger context), `problem` middleware (task_11).
  - Mount catalog routes (task_13) at `/api/catalog`, library routes (task_14) at `/api/library`.
  - Graceful shutdown on SIGTERM/SIGINT: `await boss.stop()` + `server.close()`.
- MUST implement `apps/api/src/jobs/cleanup-idempotency-keys.ts`: `DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'`; logs the deleted count.
- MUST register the job via `boss.schedule('catalog.cleanup-idempotency-keys', '0 * * * *', {})` (hourly) and `boss.work('catalog.cleanup-idempotency-keys', handler)` at boot.
- The cleanup job MUST be idempotent (re-running is harmless; no partial-delete state).
- `probePgBoss` from Foundation remains as-is — it checks schema presence, not worker liveness.

</requirements>

## Subtasks

- [x] 15.1 Extend `src/index.ts` to start/stop pg-boss.
- [x] 15.2 Add request-id middleware + register `problem` middleware globally.
- [x] 15.3 Mount catalog + library routes under their namespaces.
- [x] 15.4 Implement `src/jobs/cleanup-idempotency-keys.ts`.
- [x] 15.5 Register job schedule + worker at boot.
- [x] 15.6 Unit test boot smoke (start/stop + one request) + cleanup job unit test.

## Implementation Details

Reference Feature 001 TechSpec § System Architecture (apps/api extended section). m5nita's boot-module pattern (`/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/index.ts` lines 109-125) is the reference for SIGTERM handling.

### Relevant Files

- Foundation `apps/api/src/index.ts` (Foundation task_15) — baseline boot.
- `packages/db/src/pgboss.ts` (Foundation task_11) — `createPgBoss` factory.
- `apps/api/src/infrastructure/http/middleware/problem.ts` (task_11).
- `apps/api/src/infrastructure/http/routes/catalog.ts` (task_13).
- `apps/api/src/infrastructure/http/routes/library.ts` (task_14).

### Dependent Files

- `apps/api/src/index.ts` (modify: full boot wiring)
- `apps/api/src/jobs/cleanup-idempotency-keys.ts` (new)
- `apps/api/src/infrastructure/http/middleware/request-id.ts` (new small middleware)
- `apps/api/__tests__/jobs/cleanup-idempotency-keys.test.ts` (new)
- `apps/api/__tests__/boot.test.ts` (modify: extend foundation boot smoke with catalog + library routes)

### Related ADRs

- [ADR-003 (Foundation): pg-boss init folded into db:migrate](../../000-foundation/adrs/adr-003.md) — constrained migration ownership; this task establishes runtime client usage.
- [ADR-003 (Catalog): Idempotency-Key stored in dedicated table](adrs/adr-003.md) — cleanup job mandate.

## Deliverables

- Boot module wires pg-boss + all middleware + routes.
- Cleanup job implemented + scheduled + worker registered.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_18 smoke (boot start-to-finish).

## Tests

- Unit tests:
  - [ ] Cleanup job handler with mocked DB: executes DELETE, returns `{ deleted: N }` where N is the mocked row-count.
  - [ ] Cleanup job handler when DELETE returns 0 rows: returns `{ deleted: 0 }` without error.
  - [ ] Boot starts pg-boss, mounts routes, responds to `/health` (from Foundation) AND new `/api/catalog/search` (when provided mock Gutendex).
  - [ ] SIGTERM triggers `boss.stop()` before `process.exit(0)`.
  - [ ] Missing env `DATABASE_URL` surfaces as `ConfigError` from `loadConfig()` — boot exits 1 with grouped error.
- Integration tests:
  - [ ] Deferred to task_18 smoke.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `pnpm --filter @dialogus/api dev` starts cleanly with pg-boss connected and routes mounted.
- After 65 minutes (simulated), the cleanup job runs and logs a row count.
