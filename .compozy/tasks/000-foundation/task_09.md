---
status: completed
title: Implement Drizzle system_health schema
type: backend
complexity: low
dependencies:
  - task_08
---

# Task 9: Implement Drizzle system_health schema

## Overview

Define the `system_health` canary table in Drizzle at `packages/db/src/schema/system_health.ts` and re-export via the schema barrel. A single `system_health` row will be seeded by the initial migration (task_12) and is used by downstream integration tests as a cheap marker that migrations applied cleanly.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST define `system_health` with columns: `id uuid default uuid_generate_v4() primary key`, `status text not null default 'ok'`, `created_at timestamp not null default now()`.
- MUST use Drizzle's `pgTable` with appropriate imports from `drizzle-orm/pg-core`.
- MUST re-export the table from `packages/db/src/schema/index.ts` as a named export `systemHealth`.
- Schema definition MUST NOT contain seed data — seeding is done via raw SQL in task_12.
- MUST reference pgvector / pg-boss schemas only indirectly (they are NOT Drizzle-managed per ADR-002 and ADR-003).

</requirements>

## Subtasks

- [x] 9.1 Implement `system_health` table in `packages/db/src/schema/system_health.ts`.
- [x] 9.2 Add `uuid` + `text` + `timestamp` Drizzle imports.
- [x] 9.3 Re-export from `packages/db/src/schema/index.ts` as `systemHealth`.
- [x] 9.4 Write unit test asserting table shape.

## Implementation Details

Reference Foundation TechSpec "Data Models → Drizzle-owned domain" for column definitions. Use `sql` template from `drizzle-orm` for `now()` / `uuid_generate_v4()` defaults.

### Relevant Files

- Foundation TechSpec § Data Models.
- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/db/schema/pool.ts` — reference for Drizzle table patterns (uuid PK, timestamps).

### Dependent Files

- `./packages/db/src/schema/system_health.ts` (modify: implement table)
- `./packages/db/src/schema/index.ts` (modify: re-export)
- `./packages/db/__tests__/schema.test.ts` (new)

## Deliverables

- `systemHealth` table exported from `@dialogus/db/schema`.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — covered when task_12 generates and applies migration, verifies row count = 1.

## Tests

- Unit tests:
  - [x] Importing `systemHealth` from `@dialogus/db/schema` yields a Drizzle table whose `id`, `status`, `created_at` columns are defined.
  - [x] Column `id` has a UUID PK default calling `uuid_generate_v4()`.
  - [x] Column `status` has default `'ok'`.
  - [x] Column `created_at` has a `now()` default.
- Integration tests:
  - [ ] Deferred to task_12 (migration applies, a single seed row exists with `status = 'ok'`).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `pnpm db:generate` (task_12) will produce a valid `CREATE TABLE system_health` statement from this schema without hand-editing the generated SQL for the table body.
