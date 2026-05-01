---
status: completed
title: chapter_summaries schema + migration 0004
type: backend
complexity: low
dependencies:
  - task_03
---

# Task 19: chapter_summaries schema + migration 0004

## Overview

Add the `chapter_summaries` Drizzle schema to `@dialogus/db` per Feature 002 ADR-008 (driven by Feature 003 ADR-001 + ADR-005). Generate migration `drizzle/0004_chapter_summaries.sql` via `drizzle-kit generate`. No hand-editing required — unlike migration 0003 (HNSW), this one is pure Drizzle-supported DDL (FKs, unique constraint, timestamp default).

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add `packages/db/src/schema/chapter_summaries.ts` with the Drizzle table matching Feature 003 ADR-005 (mirrored in Feature 002 ADR-008): columns `id uuid pk`, `chapter_id uuid fk → chapters(id) on delete cascade unique`, `book_id uuid fk → books(id) on delete cascade`, `summary text not null`, `token_count int not null`, `model text not null`, `generated_at timestamptz not null default now()`.
- MUST extend `packages/db/src/schema/index.ts` barrel to export the new table.
- MUST run `pnpm db:generate` producing `packages/db/drizzle/0004_chapter_summaries.sql`. No hand-editing — pgvector HNSW is irrelevant here; Drizzle handles FKs, unique, and defaults natively.
- MUST confirm `pnpm db:reset && pnpm db:migrate` applies cleanly after task_03's migration 0003 has run (migrations are sequential and cumulative).
- MUST add an index on `chapter_summaries(book_id)` for book-scoped sweeps. `chapter_id` unique constraint acts as the primary access-path index.
- MUST NOT yet extend the `IngestionStatus` Zod enum — that edit belongs to task_23 alongside the stage handler that sets the new status value.

</requirements>

## Subtasks

- [x] 19.1 Author `packages/db/src/schema/chapter_summaries.ts`.
- [x] 19.2 Extend `packages/db/src/schema/index.ts` barrel.
- [x] 19.3 Run `pnpm db:generate`; inspect `0005_chapter_summaries.sql` (slot 0004 already taken by `0004_books_status_cleaning_indexing.sql`); confirm expected DDL (CREATE TABLE, UNIQUE, FK with CASCADE, index on book_id).
- [x] 19.4 Run migrations against a fresh throwaway DB locally; confirm clean apply (used `docker compose exec postgres psql … CREATE DATABASE dialogus_migrate_check; DATABASE_URL=… pnpm db:migrate` — `pnpm db:reset` is a foundation-gap no-op).
- [x] 19.5 Commit schema + migration together.

## Implementation Details

Reference Feature 002 ADR-008 (amendment rationale) + Feature 003 ADR-005 (final schema shape). The table is intentionally 1:1 with `chapters` via the `chapter_id` unique constraint — enforced at the DB level so the application code can assume a single summary per chapter.

### Relevant Files

- Feature 002 ADR-008: [Chapter-summary generation as a seventh ingestion stage](adrs/adr-008.md).
- Feature 003 ADR-005: [Chapter summaries live in a dedicated table](../003-rag-agent/adrs/adr-005.md).
- `packages/db/src/schema/chapters.ts` (from task_03).
- `packages/db/src/schema/books.ts` (from Feature 001).

### Dependent Files

- `packages/db/src/schema/chapter_summaries.ts` (new)
- `packages/db/src/schema/index.ts` (modify: barrel export)
- `packages/db/drizzle/0004_chapter_summaries.sql` (generated)

### Related ADRs

- [Feature 002 ADR-008: Seventh stage + this table](adrs/adr-008.md) — this task implements the table.
- [Feature 003 ADR-005: Table shape decision](../003-rag-agent/adrs/adr-005.md) — authoritative shape.

## Deliverables

- `chapter_summaries.ts` schema + `0004_chapter_summaries.sql` migration.
- Barrel updated.
- Clean apply verified locally.
- Unit tests with 80%+ coverage **(REQUIRED)** — schema-definition smoke test.
- Integration tests **(REQUIRED)** — deferred to task_23 and the updated integration suite in task_16 (full pipeline including summarize).

## Tests

- Unit tests:
  - [ ] `packages/db/__tests__/schema/chapter_summaries.test.ts` — import the table; assert `Table.name === 'chapter_summaries'`, column set matches spec, `chapterId` unique, `onDelete: cascade` on both FKs.
  - [ ] Migration file smoke: `packages/db/__tests__/migrations/0004.test.ts` reads `0004_chapter_summaries.sql` as text; asserts presence of `CREATE TABLE chapter_summaries`, `UNIQUE`, `REFERENCES chapters(id) ON DELETE CASCADE`, `REFERENCES books(id) ON DELETE CASCADE`.
- Integration tests:
  - [ ] Deferred to task_16's migration integration test (will grow to apply 0000+0001+0002+0003+0004 and assert all tables + indexes + unique constraints exist).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- `pnpm db:reset && pnpm db:migrate` works on a fresh docker-compose Postgres
- Generated SQL diff-reviewable (no hand-edits needed)
- Migration 0004 is additive — does not break existing migrations 0000–0003
