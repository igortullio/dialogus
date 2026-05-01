---
status: completed
title: apps/worker handler registration + cleanup schedule
type: backend
complexity: medium
dependencies:
  - task_02
  - task_10
  - task_11
  - task_12
  - task_13
---

# Task 15: apps/worker handler registration + cleanup schedule

## Overview

Wire all ingestion stage handlers (from tasks 10-13) and the catalog cleanup handler (moved in task_02) into `apps/worker/src/index.ts`. Register each pg-boss queue with `teamConcurrency: 1` per ADR-002 and schedule the hourly cleanup job. This is the task that makes the worker "do work"; after it, pushing to `apps/api`'s `POST /ingest` produces real end-to-end ingestion in dev.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST extend `apps/worker/src/index.ts` (scaffolded in task_02) to:
  - Construct concrete adapter instances: `DrizzleChapterRepository`, `DrizzleChunkRepository`, `GutendexDownloader`, `OpenAIEmbeddingProvider` (prod) / `MockEmbeddingProvider` (gated by `NODE_ENV !== 'production'` or an explicit `EMBEDDING_PROVIDER` env var), `EpubChapterParserWithFallback`, `TxtChapterParser`, `GutenbergCleaner`.
  - Compose `StageDeps` from the above + pino logger + pg-boss instance + db.
  - Register all 6 ingestion stage handlers with `boss.work('ingestion.<stage>', { teamConcurrency: 1 }, (job) => handler(job.data, deps))`.
  - Register `boss.work('catalog.cleanup-idempotency-keys', ...)` with the handler from task_02.
  - Call `boss.schedule('catalog.cleanup-idempotency-keys', '0 * * * *', {})` (hourly cron) once at boot.
  - Graceful SIGTERM handler: `await boss.stop()` (waits for in-flight jobs) + `process.exit(0)`; add 15s timeout fallback to avoid hanging.
- MUST read env via `loadConfig()` at boot; fail fast on missing `DATABASE_URL` or `OPENAI_API_KEY` (when prod).
- MUST log at INFO on each handler registration (`{ event: 'handler_registered', queue, concurrency }`) and on boot complete.
- Picking Mock vs. OpenAI: recommended default in dev is Mock (free, deterministic); prod auto-uses OpenAI. Control via `EMBEDDING_PROVIDER=mock|openai` env var with explicit logging of which was chosen.

</requirements>

## Subtasks

- [x] 15.1 Compose concrete adapters + deps in the boot module.
- [x] 15.2 Register 6 ingestion handlers + 1 catalog cleanup handler.
- [x] 15.3 Schedule the hourly cleanup cron.
- [x] 15.4 Implement SIGTERM graceful shutdown.
- [x] 15.5 Env-driven EmbeddingProvider selection with explicit log line.
- [x] 15.6 Unit tests for boot composition + tests around provider selection logic.

## Implementation Details

Reference Feature 002 TechSpec § Build Order step 10 + § Key Decisions for EmbeddingProvider default strategy. ADR-005 Implementation Notes has the boot-skeleton pseudocode.

### Relevant Files

- Feature 002 TechSpec § Component Overview + Build Order step 10.
- Feature 002 ADR-005 Implementation Notes.
- `apps/worker/src/index.ts` (scaffold from task_02).
- All task 10, 11, 12, 13 stage handlers.

### Dependent Files

- `apps/worker/src/index.ts` (modify: full boot wiring)
- `apps/worker/src/deps.ts` (new small module composing StageDeps)
- `apps/worker/__tests__/boot.test.ts` (new — extends the scaffold test from task_02)

### Related ADRs

- [ADR-001: Chained pg-boss jobs](adrs/adr-001.md).
- [ADR-002: Serial concurrency](adrs/adr-002.md) — `teamConcurrency: 1`.
- [ADR-005: apps/worker sole worker](adrs/adr-005.md).

## Deliverables

- `apps/worker` fully functional: starts, registers handlers, schedules cleanup, shuts down cleanly.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_16 (all 5 suites depend on worker being operational).

## Tests

- Unit tests:
  - [x] On boot with `EMBEDDING_PROVIDER=mock`: `MockEmbeddingProvider` is composed into deps; log line records the choice.
  - [x] On boot with `EMBEDDING_PROVIDER=openai`: `OpenAIEmbeddingProvider` is composed; log line records the choice.
  - [x] Default when `EMBEDDING_PROVIDER` env unset: Mock in dev/test; OpenAI in prod (via `NODE_ENV=production` branch).
  - [x] Boot registers exactly 7 handlers: 6 ingestion + 1 catalog cleanup.
  - [x] Every ingestion queue registration uses `teamConcurrency: 1` (assert via mocked boss). _Implemented as `{ batchSize: 1 }` per pg-boss v12 API rename._
  - [x] `boss.schedule('catalog.cleanup-idempotency-keys', '0 * * * *', ...)` called once.
  - [x] SIGTERM triggers `boss.stop()` within 15 seconds.
  - [x] Missing `DATABASE_URL` causes boot to throw `ConfigError`.
- Integration tests:
  - [ ] Deferred to task_16.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `pnpm --filter @dialogus/worker dev` starts cleanly, logs handler registrations, stays alive waiting for jobs.
- In dev, a `POST /ingest` from `apps/api` results in visible worker activity (log line per stage transition).
