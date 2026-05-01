# Task Memory: task_19.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Add `chapter_summaries` Drizzle table + barrel export + generated migration. Pure Drizzle DDL — no hand-edit. Defer enum extension to task_23.

## Important Decisions

- Migration tag is `0005_chapter_summaries` (slot 0004 was consumed by `0004_books_status_cleaning_indexing.sql` after task_03 was originally written). The task spec text saying `0004_chapter_summaries.sql` is stale.
- `chapterId` carries both a unique constraint and serves as the access-path index (Postgres backs UNIQUE with a btree). Add an explicit `chapter_summaries_book_id_idx` for book-scoped sweeps.
- Default `id` via `sql\`uuid_generate_v4()\`` to mirror sibling schemas (`chapters`, `chunks`); ADR-005 of feature 003 shows `defaultFn(uuidV4)` as illustrative pseudocode but repo convention is the SQL default tied to the `uuid-ossp` extension already installed in `0000_init`.

## Learnings

- Drizzle 0.30 inlines a `unique()` modifier on a column as a CONSTRAINT line in the generated SQL — no separate `unique` constraint object needed in the schema, and `getTableConfig(table).uniqueConstraints` does NOT enumerate it (the test must read the column-level `isUnique` flag instead).
- The repo convention for fresh-DB migrate verification is `docker compose exec postgres psql -U dialogus -d postgres -c "DROP DATABASE IF EXISTS …; CREATE DATABASE …"` followed by `DATABASE_URL=…/<throwaway> pnpm db:migrate` — `pnpm db:reset` is a no-op here (foundation gap).

## Files / Surfaces

- `packages/db/src/schema/chapter_summaries.ts` (new)
- `packages/db/src/schema/index.ts` (barrel export)
- `packages/db/drizzle/0005_chapter_summaries.sql` (generated, renamed from `0005_dark_iron_lad.sql`)
- `packages/db/drizzle/meta/_journal.json` (tag updated) + `meta/0005_snapshot.json` (generated)
- `packages/db/__tests__/schema/chapter_summaries.test.ts` (new — schema smoke + barrel)
- `packages/db/__tests__/migrations/0005.test.ts` (new — migration SQL smoke)

## Errors / Corrections

- The task spec lists migration filename as `0004_chapter_summaries.sql` and a test path `__tests__/migrations/0004.test.ts`. Both are stale: slot 0004 is `0004_books_status_cleaning_indexing.sql` (added after task_03 was first written). Used `0005_chapter_summaries.sql` and `__tests__/migrations/0005.test.ts`.
- First `pnpm test` run hit the documented flaky `GutendexDownloader` "minTime=1000ms apart" test (off by 1ms). Re-ran ingestion package tests — all 208 passed. No code change needed.

## Ready for Next Run
