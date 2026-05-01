# Task Memory: task_10.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Implement `ingestion.download` (stage 1) and `ingestion.clean` (stage 2) handlers as pure functions over injected deps; both update `books.ingestion_status`/`progress`/`last_stage`, do upstream-already-done checks (SHA-256 for download, file-exists for clean), enqueue the next queue, and emit pino structured logs.

## Important Decisions

- Defined `StageDeps` as the full union per techspec but exposed `DownloadStageDeps` / `CleanStageDeps` `Pick<>` aliases so handler signatures and tests only require what each stage uses (apps/worker can still pass a full `StageDeps`).
- `_common.ts` owns the shared helpers — `findBookForStage` (narrow Drizzle `findFirst` over `books`), `updateBookState` (build a `db.update(books).set(...)` payload from a discriminated update), `INGESTION_QUEUES`, `INGESTION_ERROR_SLUGS`, `preferredFormat(book)` (epub if URL set, else txt), and `rawFilePath`/`cleanFilePath` so download + clean agree on disk layout. Storage root injected via optional `deps.storageRoot` (defaults to `./storage`); tests pass a tmpdir.
- `StageLogger` is a structural minimum (`info/warn/error(meta, msg)`) — pino's `Logger` satisfies it, but ingestion package stays free of a pino dep.
- Clean stage reads raw via `createReadStream({ encoding: 'utf8' })` accumulating chunks, runs `GutenbergCleaner.clean` on the full string, and streams the result via `createWriteStream(...).end(content)`. The cleaner only meaningfully strips Project Gutenberg markers from TXT files; for EPUB raw the output is junk but unused (parse stage reads `./storage/raw/<id>.epub` directly per task_11).

## Learnings

- `INGESTION_STATUS_VALUES` in `packages/db/src/schema/books.ts` was missing `cleaning` and `indexing` even though `packages/shared/src/schemas/ingestion.ts` already had them — task_03 didn't sync the DB CHECK with the techspec's stage names. Added migration `0004_books_status_cleaning_indexing.sql` (DROP + re-ADD `books_ingestion_status_check`) plus matching enum + check edits in `books.ts`. `summarizing` is intentionally still left out — task_19 owns the migration that adds it together with the `chapter_summaries` table.
- `packages/catalog/src/domain/book/IngestionStatus.ts` duplicates the DB enum and so had to be re-synced too (plus its `Book.test.ts` and `scaffold.test.ts` literal-list assertions).
- Drizzle `db.query.books.findFirst({ where, columns: { ... } })` with a `columns` selector is the cleanest way to fetch only the fields we need without a typed mapper for an ad-hoc query.
- `npx vitest run --coverage __tests__/application/stages` from `packages/ingestion` produces a focused coverage report for the two new files; full ingestion coverage run is noisy and the GutendexDownloader bottleneck rate-limit test (`serializes back-to-back calls at least minTime=1000ms apart`) is wall-clock-flaky on a busy machine — re-running the suite was sufficient.

## Files / Surfaces

- `packages/ingestion/src/application/stages/_common.ts` (new): `StagePayload`, `StageLogger`, `StageDeps`, queue + slug constants, `findBookForStage`, `updateBookState`, `preferredFormat`, `rawFilePath`, `cleanFilePath`.
- `packages/ingestion/src/application/stages/download.ts` (new): `downloadStage`, `DownloadStageDeps`, internal `fileMatchesHash`.
- `packages/ingestion/src/application/stages/clean.ts` (new): `cleanStage`, `CleanStageDeps`, internal `readFileAsUtf8` / `writeFileStreaming`.
- `packages/ingestion/__tests__/application/stages/{download,clean}.test.ts` (new): tmpdir-based fs assertions + mock Drizzle update chain + mock pgboss.
- `packages/db/src/schema/books.ts` (edit): two more enum values + extended CHECK.
- `packages/db/drizzle/0004_books_status_cleaning_indexing.sql` + `meta/0004_snapshot.json` (new) + `meta/_journal.json` (edit, renamed tag from auto-generated `0004_stormy_marvex`).
- `packages/db/__tests__/books.test.ts` (edit): expanded enum assertion + new describe block for `0004_books_status_cleaning_indexing.sql`.
- `packages/catalog/src/domain/book/IngestionStatus.ts` + `__tests__/domain/book/Book.test.ts` + `__tests__/scaffold.test.ts` (edits): keep catalog's IngestionStatus enum literal in sync.

## Errors / Corrections

- First lint pass tripped formatter prefs (multi-line function signatures collapsed to one line); `pnpm lint:fix` fixed all 4 affected files.

## Ready for Next Run

- task_19 will create migration `0005_chapter_summaries.sql` (not 0004 as originally scoped) and extend the enum once more to add `summarizing`.
- task_15 (worker handler registration) wires `downloadStage` to queue `ingestion.download` and `cleanStage` to `ingestion.clean`. Both expect a shared `storageRoot` (default `./storage`); the `GutendexDownloader` instance must be constructed with `storageDir: <storageRoot>/raw` for paths to align with the stage's idempotency check.
