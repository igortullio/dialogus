---
status: completed
title: Implement apps/api boot assembly
type: backend
complexity: medium
dependencies:
  - task_06
  - task_10
  - task_13
  - task_14
---

# Task 15: Implement apps/api boot assembly

## Overview

Assemble `apps/api/src/index.ts` as the entry point that wires everything together: `loadConfig()` at top, construct `Database` via `createDatabase(DATABASE_URL)`, build a Hono app, mount the `/health` route via `createHealthRoute({ db })`, and serve on `API_PORT` via `@hono/node-server`. After this task, `pnpm --filter @dialogus/api dev` produces a live server responding to `/health`.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST call `loadConfig()` at the top of `index.ts` so env validation happens at boot.
- MUST instantiate `Database` via `createDatabase(cfg.DATABASE_URL)` once and share across handlers.
- MUST build a Hono app and mount `/health` via `app.route('/health', createHealthRoute({ db }))`.
- MUST start the server via `@hono/node-server`'s `serve({ fetch: app.fetch, port: cfg.API_PORT })` and log `"api listening on :${port}"` through pino.
- MUST handle SIGTERM / SIGINT by calling the returned server's close method with a reasonable timeout (≤10s) before `process.exit(0)`.
- MUST NOT block startup on a slow DB — if `createDatabase` throws synchronously (e.g., bad DSN), the process exits 1 with a useful error; otherwise the server starts even if probes later report `db: down`.
- Boot-time log fields MUST include `NODE_ENV`, `API_PORT`, and a truncated `DATABASE_URL` (host only, redacted password).

</requirements>

## Subtasks

- [x] 15.1 Write `src/index.ts` top-to-bottom: config → db → hono → routes → serve → graceful shutdown.
- [x] 15.2 Add pino logger configured per `LOG_LEVEL`.
- [x] 15.3 Register `/health` route via the factory from task_14.
- [x] 15.4 Wire SIGTERM/SIGINT handlers.
- [x] 15.5 Write a boot smoke test that imports `index.ts` and verifies the Hono app responds to `/health` on a random port.

## Implementation Details

Reference TechSpec § Build Order Step 5 for the exact sequence and Core Interfaces for `createDatabase`/`createHealthRoute` signatures. Graceful shutdown follows m5nita's SIGTERM pattern (`/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/index.ts` lines 109-125).

### Relevant Files

- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/index.ts` — structural template for boot + shutdown.
- `@dialogus/shared/config` — `loadConfig()` at entry.
- `@dialogus/db` — `createDatabase`, probes.

### Dependent Files

- `./apps/api/src/index.ts` (modify: full implementation)
- `./apps/api/__tests__/boot.test.ts` (new: boot smoke test)

## Deliverables

- `apps/api/src/index.ts` fully wired; `pnpm --filter @dialogus/api dev` produces a running server.
- Unit tests with 80%+ coverage **(REQUIRED)** — boot smoke on a random port.
- Integration tests **(REQUIRED)** — covered by task_21 end-to-end smoke.

## Tests

- Unit tests:
  - [x] Importing `src/index.ts` with `API_PORT=0` and valid env binds to an ephemeral port; a GET /health returns 200.
  - [x] With `DATABASE_URL` invalid, startup exits 1 with a `ConfigError`-style message.
  - [x] pino log line on startup contains `API_PORT` and redacted `DATABASE_URL` (no password).
  - [x] Sending SIGTERM triggers server close within 10 seconds.
- Integration tests:
  - [ ] Deferred to task_21 (full flow: docker compose up → db:migrate → apps/api dev → curl /health → `{api:'up', db:'up', pgboss:'up'}`).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `pnpm --filter @dialogus/api dev` produces a server that answers `GET /health` with schema-valid JSON.
- Invalid env fails fast with a grouped `ConfigError`.
