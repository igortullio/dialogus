---
status: completed
title: Implement createDatabase + probes with tests
type: backend
complexity: medium
dependencies:
  - task_08
  - task_09
---

# Task 10: Implement createDatabase + probes with tests

## Overview

Implement the database client factory and the `/health` probes inside `@dialogus/db`. `createDatabase(connectionString)` wraps `postgres.js` + `drizzle` into a typed singleton; `probeDb` and `probePgBoss` exercise the DB well enough to power the `/health` endpoint without being expensive on every request.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `createDatabase(connectionString: string): Database` in `packages/db/src/client.ts` using `postgres.js` 3.4+ and `drizzle-orm/postgres-js`, attaching the full schema barrel.
- MUST export the `Database` type derived from the return of `drizzle()`.
- MUST implement `probeDb(db: Database): Promise<boolean>` that issues `SELECT 1` and returns `true` on success, `false` on any thrown error.
- MUST implement `probePgBoss(db: Database): Promise<boolean>` that checks for the presence of the `pgboss` schema via `information_schema.schemata` and returns a boolean.
- Probes MUST NOT throw — they catch driver errors and return `false` so `/health` stays robust.
- Probes MUST complete in < 200ms on a healthy local Postgres.
- Re-export from `packages/db/src/index.ts`.

</requirements>

## Subtasks

- [x] 10.1 Implement `createDatabase` factory in `src/client.ts`.
- [x] 10.2 Implement `probeDb` and `probePgBoss` in `src/probes.ts`.
- [x] 10.3 Re-export from the root barrel.
- [x] 10.4 Write unit tests using a mocked db (no real Postgres at unit level).

## Implementation Details

Reference TechSpec "Core Interfaces → @dialogus/db" for `createDatabase` signature. Probes return `boolean`, not a complex status object — the /health handler composes them.

### Relevant Files

- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/db/client.ts` — template for postgres.js + drizzle singleton setup.
- Foundation TechSpec "Core Interfaces".
- Product TechSpec "System Architecture → packages/@dialogus/db".

### Dependent Files

- `./packages/db/src/client.ts` (modify: implement)
- `./packages/db/src/probes.ts` (modify: implement)
- `./packages/db/src/index.ts` (modify: re-export)
- `./packages/db/__tests__/probes.test.ts` (new)

### Related ADRs

- [ADR-004: Infrastructure-first layout for apps/api](adrs/adr-004.md) — probes are consumed by `src/infrastructure/http/routes/health.ts`.

## Deliverables

- `createDatabase`, `Database` type, `probeDb`, `probePgBoss` all exported.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to Feature 002 via Testcontainers per ADR-007 product-level.

## Tests

- Unit tests:
  - [x] `createDatabase('postgres://...')` returns a Drizzle instance with `query`, `execute`, and schema accessors.
  - [x] `probeDb` returns `true` when mocked `db.execute` resolves.
  - [x] `probeDb` returns `false` when mocked `db.execute` throws (connection refused, timeout, etc.).
  - [x] `probePgBoss` returns `true` when mocked query returns a row for schema `'pgboss'`.
  - [x] `probePgBoss` returns `false` when mocked query returns an empty result.
  - [x] `probePgBoss` returns `false` when mocked query throws.
- Integration tests:
  - [ ] Deferred to Feature 002 (integration suite with Testcontainers verifies probes against real Postgres).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `createDatabase` compiles and type-checks end-to-end against the schema barrel.
- Probes never throw in any branch observed by unit tests.
