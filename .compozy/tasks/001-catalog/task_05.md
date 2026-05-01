---
status: completed
title: "@dialogus/db idempotency_keys schema + migration 0002"
type: backend
complexity: low
dependencies:
  - task_04
---

# Task 5: @dialogus/db idempotency_keys schema + migration 0002

## Overview

Define the `idempotency_keys` table as a cross-cutting store for `Idempotency-Key` header state per ADR-003. Single-table schema with `(key, request_hash, response_status, response_body, created_at)`. Also adds a btree index on `created_at` for the cleanup job query.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST define `packages/db/src/schema/idempotency_keys.ts` per Feature 001 TechSpec § Data Models → `idempotency_keys`: `key TEXT PK`, `request_hash TEXT NOT NULL`, `response_status INT NOT NULL`, `response_body JSONB NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- MUST add a btree index on `created_at` for the hourly cleanup query.
- MUST re-export from `packages/db/src/schema/index.ts`.
- MUST run `pnpm db:generate` to produce `drizzle/0002_idempotency_keys.sql`; commit unedited.
- MUST verify `pnpm db:migrate` applies it on top of `0001_books` cleanly.

</requirements>

## Subtasks

- [x] 5.1 Implement `idempotency_keys` Drizzle table.
- [x] 5.2 Add `idempotency_keys_created_at_idx` btree index.
- [x] 5.3 Re-export from `schema/index.ts`.
- [x] 5.4 Generate and commit `0002_idempotency_keys.sql`.
- [x] 5.5 Verify clean migration order.

## Implementation Details

Reference Feature 001 ADR-003 schema block for column definitions. This is a simpler migration than `books`; no partial indexes, no CHECK constraints.

### Relevant Files

- Feature 001 ADR-003: [Idempotency-Key stored in dedicated table](adrs/adr-003.md).
- Feature 001 TechSpec § Data Models.
- `packages/db/drizzle/0001_books.sql` (task_04) — precedes this migration.

### Dependent Files

- `packages/db/src/schema/idempotency_keys.ts` (new)
- `packages/db/src/schema/index.ts` (modify: export `idempotencyKeys`)
- `packages/db/drizzle/0002_idempotency_keys.sql` (new, generated)
- `packages/db/drizzle/meta/_journal.json` (modify)

### Related ADRs

- [ADR-003: Idempotency-Key stored in dedicated table](adrs/adr-003.md).

## Deliverables

- `idempotency_keys` Drizzle table + btree index on `created_at`.
- `0002_idempotency_keys.sql` committed.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_12 (idempotency middleware exercises the schema against Testcontainers DB).

## Tests

- Unit tests:
  - [x] Table has columns `key`, `request_hash`, `response_status`, `response_body`, `created_at`.
  - [x] `key` is primary key.
  - [x] `created_at` has default `now()`.
  - [x] `response_body` column type is `jsonb`.
  - [x] `0002_idempotency_keys.sql` includes `CREATE INDEX` on `created_at`.
- Integration tests:
  - [ ] Deferred to task_12 (real Testcontainers insert/select round-trip).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `pnpm db:reset && pnpm db:migrate` applies all three migrations cleanly: `0000_init`, `0001_books`, `0002_idempotency_keys`.
