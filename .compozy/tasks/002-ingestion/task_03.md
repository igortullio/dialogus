---
status: completed
title: chapters + chunks schemas + migration 0003
type: backend
complexity: medium
dependencies:
  - task_02
---

# Task 3: chapters + chunks schemas + migration 0003

## Overview

Define Drizzle schemas for `chapters` and `chunks` (the vector-indexed retrieval unit), extend `books` with ingestion lifecycle columns, and generate `drizzle/0003_chapters_chunks.sql`. The generated SQL is then hand-edited to add the HNSW index on `chunks.embedding` — the second sanctioned hand-edit case in the project (after Foundation's extensions).

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add `packages/db/src/schema/chapters.ts` with columns per Feature 002 TechSpec § Data Models → chapters table, including unique constraint on `(book_id, ordinal)` and FK to books with `ON DELETE CASCADE`.
- MUST add `packages/db/src/schema/chunks.ts` with columns per TechSpec § Data Models → chunks table, including `embedding vector(1536)`, FKs to books and chapters with `ON DELETE CASCADE`, unique on `(book_id, chapter_id, ordinal)`.
- MUST extend `packages/db/src/schema/books.ts` with columns `ingestion_progress int not null default 0 CHECK (BETWEEN 0 AND 100)`, `ingestion_last_stage text`, `ingestion_started_at timestamptz`, `indexed_at timestamptz`.
- MUST add partial indexes via Drizzle:
  - `chunks(book_id) WHERE embedding IS NULL` (embed-stage query).
  - `chunks(chapter_id)` (chapter-scoped retrieval).
  - `chapters(book_id, ordinal)` (natural order).
- MUST re-export the new tables from `packages/db/src/schema/index.ts` barrel.
- MUST generate `packages/db/drizzle/0003_chapters_chunks.sql` via `pnpm db:generate`.
- MUST hand-edit the generated SQL to append: `CREATE INDEX chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);` immediately after the `chunks` CREATE TABLE.
- MUST verify `pnpm db:reset && pnpm db:migrate` applies cleanly against docker-compose Postgres 18 + pgvector 0.8+.

</requirements>

## Subtasks

- [x] 3.1 Author `chapters` Drizzle table with FK + indexes.
- [x] 3.2 Author `chunks` Drizzle table with `vector(1536)` column + FK + partial indexes.
- [x] 3.3 Extend `books` table with 4 ingestion lifecycle columns.
- [x] 3.4 Re-export from schema barrel.
- [x] 3.5 Run `pnpm db:generate` → hand-edit SQL to add HNSW index.
- [x] 3.6 Commit with explicit changelog note on hand-edit rationale.
- [x] 3.7 Run `pnpm db:reset && pnpm db:migrate` to verify migration applies.

## Implementation Details

Reference Feature 002 TechSpec § Data Models for exact column definitions and § Build Order step 3 for the hand-edit rationale. pgvector's HNSW index is documented at https://github.com/pgvector/pgvector#hnsw-indexing.

### Relevant Files

- Feature 002 TechSpec § Data Models.
- `packages/db/src/schema/books.ts` (001-catalog task_04) — existing schema to extend.
- `packages/db/src/schema/system_health.ts` (000-foundation task_09) — pattern reference.
- `packages/db/drizzle/0002_idempotency_keys.sql` (001-catalog task_05) — precedes this migration.

### Dependent Files

- `packages/db/src/schema/chapters.ts` (new)
- `packages/db/src/schema/chunks.ts` (new)
- `packages/db/src/schema/books.ts` (modify: 4 new columns)
- `packages/db/src/schema/index.ts` (modify: re-export)
- `packages/db/drizzle/0003_chapters_chunks.sql` (new, generated + hand-edited)
- `packages/db/drizzle/meta/_journal.json` (modify, generated)

### Related ADRs

- [ADR-002: Generate-only Drizzle migrations](../../000-foundation/adrs/adr-002.md) (Foundation) — this is the second sanctioned hand-edit.
- [ADR-004: Streaming discipline](adrs/adr-004.md) — partial index on `WHERE embedding IS NULL` supports streaming-friendly "what still needs embedding" queries.

## Deliverables

- `chapters` + `chunks` Drizzle schemas.
- Extended `books` with 4 lifecycle columns.
- Generated + hand-edited `0003_chapters_chunks.sql` committed.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_16 (`migration-0003.integration.test.ts`).

## Tests

- Unit tests:
  - [ ] `chapters` Drizzle object has columns: id, book_id, ordinal, title, plain_text, token_count, created_at.
  - [ ] `chapters` has unique constraint `(book_id, ordinal)` and FK to books with CASCADE.
  - [ ] `chunks` Drizzle object has columns: id, book_id, chapter_id, ordinal, text, token_count, start_char, end_char, embedding, created_at.
  - [ ] `chunks.embedding` is `vector(1536)` type (via pgvector drizzle helper).
  - [ ] `books` now has columns: ingestion_progress (with CHECK), ingestion_last_stage, ingestion_started_at, indexed_at.
  - [ ] `0003_chapters_chunks.sql` contains the HNSW index line `CREATE INDEX chunks_embedding_hnsw_idx ON chunks USING hnsw`.
  - [ ] `0003_chapters_chunks.sql` contains partial index line on `chunks(book_id) WHERE embedding IS NULL`.
  - [ ] `0003_chapters_chunks.sql` contains CHECK constraint on `ingestion_progress BETWEEN 0 AND 100`.
- Integration tests:
  - [ ] Deferred to task_16 (`migration-0003.integration.test.ts`) — apply all 4 migrations on fresh Testcontainers Postgres, assert tables + all indexes + HNSW exist.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `pnpm db:reset && pnpm db:migrate` on clean Postgres applies 0000 + 0001 + 0002 + 0003 without errors.
- `psql -c '\d chunks'` shows the HNSW index and the partial "WHERE embedding IS NULL" index.
