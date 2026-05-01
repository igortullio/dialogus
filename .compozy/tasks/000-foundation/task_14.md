---
status: completed
title: Implement /health route handler with tests
type: backend
complexity: medium
dependencies:
  - task_07
  - task_10
  - task_13
---

# Task 14: Implement /health route handler with tests

## Overview

Implement the `/health` route handler at `apps/api/src/infrastructure/http/routes/health.ts`. The handler calls `probeDb` + `probePgBoss` in parallel, validates the composed response via `healthResponseSchema`, and returns the Zod-inferred shape. This endpoint is the contract the `apps/web` Server Component depends on for the E2E wiring proof.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST export a factory `createHealthRoute(deps: { db: Database }): Hono` (or equivalent handler) from `apps/api/src/infrastructure/http/routes/health.ts`.
- Handler MUST call `probeDb` and `probePgBoss` in parallel via `Promise.all`.
- Handler MUST compose `{ api: 'up', db: probeDb ? 'up' : 'down', pgboss: probePgBoss ? 'up' : 'down' }` and validate via `healthResponseSchema` from `@dialogus/shared/schemas/health` before returning.
- MUST return HTTP 200 even when `db` or `pgboss` are `'down'` (the endpoint is informational, not a gate).
- Content-Type MUST be `application/json`.
- MUST NOT leak raw driver errors — probe booleans are sufficient.
- Total response time under 200ms on a healthy local Postgres.

</requirements>

## Subtasks

- [x] 14.1 Implement `createHealthRoute(deps)` factory accepting a `Database` instance.
- [x] 14.2 Call probes in parallel and compose the response object.
- [x] 14.3 Validate with `healthResponseSchema` before `c.json(...)`.
- [x] 14.4 Write unit tests covering all up/down combinations with mocked probes.

## Implementation Details

Reference Foundation TechSpec § API Endpoints and ADR-004. Route registration happens in task_15 via `app.route('/health', createHealthRoute({ db }))`.

### Relevant Files

- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/http/routes/` — folder pattern.
- Foundation TechSpec § Implementation Design.
- `@dialogus/shared/schemas/health` (from task_07).
- `@dialogus/db` probes (from task_10).

### Dependent Files

- `./apps/api/src/infrastructure/http/routes/health.ts` (new: route handler)
- `./apps/api/__tests__/health.test.ts` (new: handler tests)

### Related ADRs

- [ADR-004: Infrastructure-first layout for apps/api](adrs/adr-004.md) — dictates this file location.

## Deliverables

- `createHealthRoute` factory exported and callable.
- Unit tests with 80%+ coverage **(REQUIRED)** — all up/down permutations.
- Integration tests **(REQUIRED)** — covered by task_21 smoke (real server + real Postgres).

## Tests

- Unit tests:
  - [x] Both probes resolve `true`: handler returns `{ api: 'up', db: 'up', pgboss: 'up' }` with status 200.
  - [x] `probeDb` returns `false`: handler returns `{ api: 'up', db: 'down', pgboss: 'up' }`.
  - [x] `probePgBoss` returns `false`: handler returns `{ api: 'up', db: 'up', pgboss: 'down' }`.
  - [x] Both probes return `false`: handler returns `{ api: 'up', db: 'down', pgboss: 'down' }` still with status 200.
  - [x] Response body validates against `healthResponseSchema` in all cases.
  - [x] Response Content-Type header is `application/json`.
- Integration tests:
  - [ ] Deferred to task_21 (real server + docker-compose Postgres → curl /health returns all `'up'`).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Handler returns 200 with a schema-valid body in every observed probe permutation.
- No code path throws for any probe failure.
