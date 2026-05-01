# Task Memory: task_03.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Land Drizzle schemas for `chapters` + `chunks` (vector(1536)), extend `books` with 4 lifecycle columns, generate + hand-edit `0003_chapters_chunks.sql` to add the HNSW index.

## Important Decisions

- Indexed `chunks(book_id, chapter_id, ordinal)` via UNIQUE constraint only (composite UNIQUE creates a btree index — no separate redundant index emitted). Spec requested an explicit "natural order for iteration" index but UNIQUE already covers it; avoiding duplication.
- `embedding` column declared nullable (no `.notNull()`); ingestion writes it after the embed stage, and the `WHERE embedding IS NULL` partial index depends on this nullability.
- Hand-edited HNSW line placed immediately after the `chunks` CREATE TABLE block (before the books ALTERs / FK ADDs), keeping the partial-index DDL after the column-affecting ALTERs as drizzle-kit emitted them.

## Learnings

- `drizzle-kit` names a generated migration with a random suffix (e.g. `0003_wonderful_surge.sql`). Renamed both the SQL file and the journal `tag` field to the spec-mandated `0003_chapters_chunks`. The migrator looks up SQL files by journal `tag`, so both must match.
- `pnpm db:reset` currently no-ops the drop step (the `--reset` flag is declared in `package.json` but unhandled in `migrate.ts`). Verified clean apply by manually creating a throwaway `dialogus_clean` DB and running migrate against it. Foundation follow-up.
- `BookRow` (= `books.$inferSelect`) typing flowed into `packages/catalog` test fixtures; had to extend two `buildRow()` helpers with the 4 new columns to keep typecheck green. `BookMapper` itself untouched — those fields aren't surfaced on the catalog `Book` entity yet.
- Biome auto-formatted `it.each([...])` array layout and the `check(...)` call in `books.ts`; resulting style applied with no behavior change.

## Files / Surfaces

- `packages/db/src/schema/chapters.ts` (new)
- `packages/db/src/schema/chunks.ts` (new — exports `CHUNK_EMBEDDING_DIMENSIONS`)
- `packages/db/src/schema/books.ts` (4 new columns + ingestion_progress CHECK)
- `packages/db/src/schema/index.ts` (re-exports)
- `packages/db/drizzle/0003_chapters_chunks.sql` (generated + hand-edited HNSW)
- `packages/db/drizzle/meta/_journal.json` (tag renamed)
- `packages/db/drizzle/meta/0003_snapshot.json` (auto-generated)
- `packages/db/__tests__/chapters.test.ts` (new)
- `packages/db/__tests__/chunks.test.ts` (new)
- `packages/db/__tests__/books.test.ts` (extended for 4 new columns + new CHECK)
- `packages/catalog/__tests__/infrastructure/persistence/DrizzleBookRepository.test.ts` (fixture extended)
- `packages/catalog/__tests__/infrastructure/persistence/mappers/BookMapper.test.ts` (fixture extended)

## Errors / Corrections

- None blocking. Initial `pnpm typecheck` flagged 2 errors in catalog test fixtures (resolved by adding the 4 new column literals to `buildRow()`).

## Ready for Next Run

- task_05 (DrizzleChapterRepository / DrizzleChunkRepository) can use `chapters`, `chunks`, and `CHUNK_EMBEDDING_DIMENSIONS` from `@dialogus/db/schema`.
- task_14 (`GET /api/library/books/:id/ingestion`) reads the new books columns directly.
- The catalog `Book` domain entity does **not** yet expose ingestion_progress / ingestion_last_stage / ingestion_started_at / indexed_at — feature-002 routes likely read them via a separate ingestion-status mapper rather than extending the catalog `Book`. Confirm direction before task_14.
