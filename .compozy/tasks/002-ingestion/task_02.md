---
status: completed
title: apps/worker scaffold + retrofit apps/api cleanup removal
type: infra
complexity: medium
dependencies: []
---

# Task 2: apps/worker scaffold + retrofit apps/api cleanup removal

## Overview

Introduce `apps/worker` as the first dedicated background process in the project. Its sole responsibility is to host pg-boss consumers: ingestion stage handlers (registered in task_15) and the catalog cleanup job (migrated from `apps/api` in this same task per ADR-005). Retroactively removes the pg-boss init + cleanup handler from `apps/api`'s boot module, leaving `apps/api` purely request-handling.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `apps/worker/package.json` with `"name": "@dialogus/worker"`, `"type": "module"`, dependencies on `@dialogus/shared`, `@dialogus/db`, `pg-boss@^12`, `pino`, `pino-pretty`, `tsx`.
- MUST create `apps/worker/tsconfig.json` extending root.
- MUST create `apps/worker/src/index.ts` boot scaffold: `loadConfig` → `createPgBoss(DATABASE_URL)` → `await boss.start()` → graceful SIGTERM handler. Handler registration (`boss.work(...)`) stays minimal in this task; populated by task_15.
- MUST create `apps/worker/src/handlers/catalog-cleanup-idempotency-keys.ts` by MOVING the handler body from `apps/api/src/jobs/cleanup-idempotency-keys.ts`. File at origin is DELETED.
- MUST remove `boss.start`, `boss.schedule`, `boss.work` invocations from `apps/api/src/index.ts` boot; apps/api retains `createPgBoss` only for transient `send()` calls in route handlers (short-lived instance per request).
- MUST add a tiny helper `apps/api/src/infrastructure/pgboss/enqueue.ts` exporting `enqueue(queue, data): Promise<jobId>` — creates a transient boss, sends, stops — reusable by future routes (task_14).
- MUST update root `package.json` `dev` script so `pnpm dev` starts api + worker + web in parallel.
- MUST update README Architecture section to describe the three runtime processes (api + worker + web) explicitly.
- **SUPERSEDE NOTE**: This task partially supersedes 001-catalog task_15 (pg-boss init + cleanup handler). A header note goes in task_15 referencing this task as the migration point.

</requirements>

## Subtasks

- [x] 2.1 Scaffold `apps/worker/` (package.json, tsconfig, src/index.ts boot).
- [x] 2.2 Move cleanup handler body from `apps/api/src/jobs/` to `apps/worker/src/handlers/`.
- [x] 2.3 Remove pg-boss init + handler registration from `apps/api/src/index.ts`.
- [x] 2.4 Add transient-enqueue helper at `apps/api/src/infrastructure/pgboss/enqueue.ts`.
- [x] 2.5 Update root `pnpm dev` to include worker in parallel startup.
- [x] 2.6 Update README Architecture section + add supersede note to 001-catalog/task_15.md.
- [x] 2.7 Unit tests for the transient-enqueue helper + for worker boot smoke.

## Implementation Details

Reference Feature 002 ADR-005 for the migration rationale and Feature 002 TechSpec § Build Order step 2 for the scope. The apps/worker boot module mirrors apps/api's boot structure (loadConfig → createDatabase/pg-boss → register → listen/work) but binds no HTTP port.

### Relevant Files

- `apps/api/src/jobs/cleanup-idempotency-keys.ts` (from 001-catalog task_15) — source of handler body.
- `apps/api/src/index.ts` (from 001-catalog task_15) — cleanup/schedule code removed.
- `packages/db/src/pgboss.ts` (from 000-foundation task_11) — `createPgBoss` factory.
- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/index.ts` lines 109-125 — SIGTERM template.

### Dependent Files

- `apps/worker/package.json` (new)
- `apps/worker/tsconfig.json` (new)
- `apps/worker/src/index.ts` (new — boot; handler registration in task_15)
- `apps/worker/src/handlers/catalog-cleanup-idempotency-keys.ts` (new — moved from apps/api)
- `apps/api/src/jobs/cleanup-idempotency-keys.ts` (DELETED)
- `apps/api/src/index.ts` (modify: remove pg-boss init + schedule + worker calls)
- `apps/api/src/infrastructure/pgboss/enqueue.ts` (new helper)
- `package.json` (modify: root `dev` script includes worker)
- `README.md` (modify: Architecture section)
- `.compozy/tasks/001-catalog/task_15.md` (modify: add supersede note at top)
- `apps/worker/__tests__/boot.test.ts` (new)
- `apps/api/__tests__/infrastructure/pgboss/enqueue.test.ts` (new)

### Related ADRs

- [ADR-005: apps/worker as sole pg-boss worker](adrs/adr-005.md) — this task implements the migration.

## Deliverables

- `apps/worker` process that starts cleanly, hosts the (migrated) catalog cleanup handler, and awaits further handler registrations from task_15.
- `apps/api` boot simplified; pg-boss only used via transient `enqueue` helper for route send() calls.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_16 (worker is fully exercised by ingestion integration suites).

## Tests

- Unit tests:
  - [x] `apps/worker` boot with valid env + migrated DB: `boss.start()` resolves; SIGTERM triggers `boss.stop()` within 10 seconds.
  - [x] `apps/worker` registers the catalog-cleanup handler function (check by calling the boot code against a mock boss).
  - [x] `apps/api/src/infrastructure/pgboss/enqueue.ts` creates a transient boss, calls `send(queue, data)`, calls `stop()`, returns a jobId string.
  - [x] `apps/api/src/index.ts` boot no longer calls `boss.start`, `boss.schedule`, or `boss.work` (grep assertion in test or confirmed by absence).
  - [x] Root `package.json` `dev` script contains `worker` among parallel targets.
- Integration tests:
  - [ ] Deferred to task_16 (end-to-end with worker running).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `pnpm dev` starts api + worker + web in parallel; all three healthy.
- 001-catalog `task_15.md` has a supersede note clarifying that parts migrated to Feature 002 task_02.
