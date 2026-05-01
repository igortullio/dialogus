---
status: completed
title: "@dialogus/db books schema + migration 0001"
type: backend
complexity: medium
dependencies: []
---

# Task 4: @dialogus/db books schema + migration 0001

## Overview

Define the `books` Drizzle table — the first real domain table in dIAlogus — with all columns from the product TechSpec plus the `tags` jsonb reservation. Generate and commit `drizzle/0001_books.sql` with partial indexes on `(created_at desc, id desc) where deleted_at is null` and `(ingestion_status) where deleted_at is null` for cursor pagination and status-filter performance.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST define `packages/db/src/schema/books.ts` with all columns per Feature 001 TechSpec § Data Models → `books`.
- MUST include `tags jsonb not null default '[]'` as a forward-looking reservation (no runtime use in V1, per TechSpec § Key Decisions item 5).
- MUST add partial indexes via Drizzle's `.where()` modifier:
  - `books_created_at_id_active_idx` on `(created_at DESC, id DESC)` with `WHERE deleted_at IS NULL`.
  - `books_ingestion_status_active_idx` on `(ingestion_status)` with `WHERE deleted_at IS NULL`.
- `ingestion_status` MUST be text with CHECK constraint matching the `IngestionStatus` enum values.
- MUST re-export the table from `packages/db/src/schema/index.ts` as `books`.
- MUST run `pnpm db:generate` exactly once to produce `packages/db/drizzle/0001_books.sql`; commit the file as-is (no hand-editing per ADR-002).
- MUST verify `pnpm db:reset && pnpm db:migrate` applies cleanly on docker-compose Postgres before task closure.

</requirements>

## Subtasks

- [x] 4.1 Implement `books` Drizzle table with all columns and defaults.
- [x] 4.2 Add partial indexes via `.where()` in the Drizzle definition.
- [x] 4.3 Re-export from `schema/index.ts`.
- [x] 4.4 Run `pnpm db:generate` and commit `0001_books.sql` unedited.
- [x] 4.5 Verify end-to-end: `pnpm db:reset && pnpm db:migrate` succeeds.

## Implementation Details

Reference Feature 001 TechSpec § Data Models for the exact column list. Partial-index syntax: `index('name').on(column).where(sql\`deleted_at IS NULL\`)`. Drizzle-kit detects partial indexes natively and emits the correct SQL.

### Relevant Files

- Feature 001 TechSpec § Data Models.
- `packages/db/src/schema/system_health.ts` (Foundation task_09) — Drizzle table pattern reference.
- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/db/schema/pool.ts` — reference for Drizzle table with indexes + FKs.
- `packages/db/drizzle/0000_init.sql` (Foundation task_12) — precedes this migration.

### Dependent Files

- `packages/db/src/schema/books.ts` (new)
- `packages/db/src/schema/index.ts` (modify: export `books`)
- `packages/db/drizzle/0001_books.sql` (new, generated)
- `packages/db/drizzle/meta/_journal.json` (modify, generated)

### Related ADRs

- [ADR-002: Generate-only Drizzle migrations](../../000-foundation/adrs/adr-002.md) (Foundation) — no `push`, no hand-editing.
- [ADR-005: Tuple cursor `{created_at, id}` base64 JSON](adrs/adr-005.md) — partial index supports the cursor filter.

## Deliverables

- `books` Drizzle table with partial indexes.
- Generated `0001_books.sql` committed.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — migration applies cleanly against Testcontainers Postgres in task_13 `migration.integration.test.ts`.

## Tests

- Unit tests:
  - [ ] `books` Drizzle object has columns: `id`, `gutendex_id`, `title`, `authors`, `languages`, `subjects`, `download_url_epub`, `download_url_txt`, `cover_url`, `raw_hash`, `ingestion_status`, `ingestion_error`, `tags`, `created_at`, `updated_at`, `deleted_at`.
  - [ ] `gutendex_id` has unique constraint.
  - [ ] `tags` default is `[]`.
  - [ ] `ingestion_status` default is `'discovered'`.
  - [ ] `deleted_at` nullable.
  - [ ] `0001_books.sql` contains `CREATE INDEX` statements with `WHERE deleted_at IS NULL`.
  - [ ] `0001_books.sql` contains CHECK constraint for `ingestion_status` enum values.
- Integration tests:
  - [ ] Deferred to task_13 (`migration.integration.test.ts` boots a fresh container, runs all migrations, asserts table + indexes exist).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `pnpm db:reset && pnpm db:migrate` on a clean Postgres applies `0000_init` + `0001_books` without errors.
- `psql -c '\d books'` shows all columns + both partial indexes.
