---
status: completed
title: Generate initial SQL migration + extensions + seed
type: infra
complexity: medium
dependencies:
  - task_04
  - task_09
  - task_11
---

# Task 12: Generate initial SQL migration + extensions + seed

## Overview

Run `pnpm db:generate` to produce `packages/db/drizzle/0000_init.sql` from the `system_health` schema, then hand-edit the file to prepend `CREATE EXTENSION` statements for `vector` and `uuid-ossp` and append a seed row. Verifies end-to-end that `pnpm db:migrate` applies cleanly against the docker-compose Postgres from task_04.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST run `pnpm db:generate` producing `packages/db/drizzle/0000_init.sql` from the Drizzle schema (system_health).
- MUST hand-edit the generated SQL to PREPEND `CREATE EXTENSION IF NOT EXISTS vector;` and `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";` above the `system_health` table DDL.
- MUST APPEND `INSERT INTO system_health (status) VALUES ('ok');` at the end of the migration (single seed row).
- MUST commit both `0000_init.sql` and `packages/db/drizzle/meta/_journal.json` (or equivalent Drizzle metadata).
- MUST verify via manual smoke: `docker compose up -d && pnpm db:migrate` applies cleanly; `psql -c "SELECT COUNT(*) FROM system_health;"` returns 1; `psql -c "\dx"` lists `vector` and `uuid-ossp`; `psql -c "\dn"` lists `pgboss`.
- Hand-editing generated SQL is the ONLY legitimate reason to modify a Drizzle-generated file (per ADR-002 Implementation Notes).

</requirements>

## Subtasks

- [x] 12.1 Ensure `docker compose up -d` is running.
- [x] 12.2 Run `pnpm db:generate` and commit the raw output first.
- [x] 12.3 Hand-edit `0000_init.sql` to prepend CREATE EXTENSION statements and append seed row.
- [x] 12.4 Commit the edited SQL with a commit message noting the extensions addition.
- [x] 12.5 Run `pnpm db:reset && pnpm db:migrate` and verify via psql.

## Implementation Details

Reference ADR-002 Implementation Notes for the extension-prepend rationale and Foundation TechSpec § Data Models for the exact extension names. This is the one migration where hand-editing is sanctioned.

### Relevant Files

- `./packages/db/drizzle.config.ts` — tells `db:generate` where to write SQL.
- `./docker-compose.yml` — provides the Postgres target.
- Foundation ADR-002: [Generate-only Drizzle migrations](adrs/adr-002.md).

### Dependent Files

- `./packages/db/drizzle/0000_init.sql` (new, generated then edited)
- `./packages/db/drizzle/meta/_journal.json` (new, drizzle metadata)

### Related ADRs

- [ADR-002: Generate-only Drizzle migrations](adrs/adr-002.md) — explicit sanction for hand-editing the initial migration to add extensions.
- [ADR-003: pg-boss init folded into db:migrate](adrs/adr-003.md) — `pnpm db:migrate` triggers pg-boss init after Drizzle, producing the `pgboss` schema verified in smoke.

## Deliverables

- `packages/db/drizzle/0000_init.sql` with extensions + `system_health` + seed.
- Drizzle metadata files committed alongside.
- Unit tests with 80%+ coverage **(REQUIRED)** — structural SQL contents check.
- Integration tests **(REQUIRED)** — full `db:migrate` cycle applies cleanly.

## Tests

- Unit tests:
  - [ ] `0000_init.sql` contains `CREATE EXTENSION IF NOT EXISTS vector;`.
  - [ ] `0000_init.sql` contains `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`.
  - [ ] `0000_init.sql` contains `CREATE TABLE` for `system_health`.
  - [ ] `0000_init.sql` contains `INSERT INTO system_health (status) VALUES ('ok');`.
  - [ ] Extensions statements appear BEFORE the `CREATE TABLE` statement.
- Integration tests:
  - [ ] Against docker-compose Postgres: `pnpm db:reset && pnpm db:migrate` exits 0.
  - [ ] After migration, `SELECT COUNT(*) FROM system_health` returns 1.
  - [ ] After migration, `SELECT extname FROM pg_extension WHERE extname IN ('vector', 'uuid-ossp');` returns 2 rows.
  - [ ] After migration, `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'pgboss';` returns 1 row.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- A fresh `pnpm db:reset && pnpm db:migrate` cycle consistently produces the expected database state.
- pgvector 0.8+ and uuid-ossp are usable for subsequent features without additional migration work.
