---
status: completed
title: Implement pgboss factory + runMigrations with tests
type: backend
complexity: medium
dependencies:
  - task_10
---

# Task 11: Implement pgboss factory + runMigrations with tests

## Overview

Implement the `createPgBoss` factory and `runMigrations` orchestration inside `@dialogus/db`. `runMigrations` is the single entry point invoked by `pnpm db:migrate` — it applies Drizzle SQL migrations, then starts and stops pg-boss to install / evolve the `pgboss` schema (per ADR-003).

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `createPgBoss(connectionString: string): PgBoss` in `packages/db/src/pgboss.ts` returning a `pg-boss` 12 instance (not yet started).
- MUST implement `runMigrations(connectionString: string): Promise<void>` in `packages/db/src/migrate.ts` that (a) applies Drizzle SQL migrations via `drizzle-orm/postgres-js/migrator#migrate` pointing at `./drizzle/`, then (b) calls `pgboss.start()` + `pgboss.stop()` on a fresh instance.
- MUST emit pino structured logs per stage: `{ stage: 'drizzle', msg: 'applying Drizzle migrations' }` → `{ stage: 'pgboss', msg: 'starting pg-boss' }` → `{ stage: 'done' }`.
- MUST wrap the two stages in explicit try/catch so a pg-boss failure logs `stage: 'pgboss'` with `error` before rethrowing (per ADR-003 diagnosability mitigation).
- `packages/db/src/migrate.ts` MUST be an executable entry point (shebang or invoked via `tsx`) so `pnpm db:migrate` runs it.
- Apps MUST NOT call `pgboss.start()` themselves — this is the only place it runs (per ADR-003).

</requirements>

## Subtasks

- [x] 11.1 Implement `createPgBoss` factory.
- [x] 11.2 Implement `runMigrations` with stage logging and try/catch.
- [x] 11.3 Wire `pnpm db:migrate` in `packages/db/package.json` to `tsx src/migrate.ts`.
- [x] 11.4 Write unit tests with mocked Drizzle migrator and mocked pg-boss.
- [x] 11.5 Verify that starting pg-boss is never called from `apps/api` or `apps/web`.

## Implementation Details

Reference TechSpec "Core Interfaces → @dialogus/db/migrate" for the function signature and ADR-003 Implementation Notes for the exact logging pattern and error handling sequence.

### Relevant Files

- Foundation TechSpec "Core Interfaces → runMigrations".
- Foundation ADR-003: [pg-boss init folded into db:migrate](adrs/adr-003.md).
- pg-boss 12 docs (https://github.com/timgit/pg-boss).

### Dependent Files

- `./packages/db/src/pgboss.ts` (modify: implement factory)
- `./packages/db/src/migrate.ts` (modify: implement runMigrations + CLI entry)
- `./packages/db/src/index.ts` (modify: re-export factory and runMigrations)
- `./packages/db/package.json` (modify: wire `db:migrate` script)
- `./packages/db/__tests__/migrate.test.ts` (new)

### Related ADRs

- [ADR-003: pg-boss init folded into db:migrate](adrs/adr-003.md) — the authoritative decision this task implements.

## Deliverables

- `createPgBoss`, `runMigrations` exported from `@dialogus/db`.
- `pnpm db:migrate` executes the full ceremony end-to-end against a real Postgres.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_12 smoke (applies real migration on docker-compose Postgres).

## Tests

- Unit tests:
  - [x] `createPgBoss(url)` returns an instance whose `start`/`stop` methods exist and have not been called yet.
  - [x] `runMigrations` invokes Drizzle `migrate` first, then `pgBoss.start`, then `pgBoss.stop` — verified via call order on mocks.
  - [x] `runMigrations` logs stages `'drizzle'`, `'pgboss'`, `'done'` in order when successful.
  - [x] If Drizzle `migrate` throws, `pgBoss.start` is NOT called; error propagates with stage context.
  - [x] If `pgBoss.start` throws, the error is logged with `stage: 'pgboss'` before rethrow.
- Integration tests:
  - [x] Deferred to task_12 (applies migration against docker-compose Postgres and verifies both `system_health` row + `pgboss` schema exist).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `pnpm db:migrate` produces the expected stage-ordered log lines.
- A grep for `pgboss.start` / `pgBoss.start` in `apps/` returns zero hits (enforcement of ADR-003 "apps never start pg-boss").
