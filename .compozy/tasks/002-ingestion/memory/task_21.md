# Task Memory: task_21.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Ship `DrizzleChapterSummaryRepository` + `ChapterSummaryMapper` + barrel re-export of the concrete class (Feature 003 ADR-006 carve-out).

## Important Decisions

- Used `notExists` from `drizzle-orm` to express the single-round-trip `listMissingChapterIds` query as `SELECT chapters.id FROM chapters WHERE book_id = $1 AND NOT EXISTS (SELECT 1 FROM chapter_summaries WHERE chapter_id = chapters.id) ORDER BY ordinal ASC`.
- `save()` upserts via `onConflictDoUpdate({ target: chapterSummaries.chapterId })` and returns the persisted row (not void) — `ChapterSummaryRepository.port` requires `Promise<ChapterSummary>`. The set excludes `id` (so a regenerated row keeps its primary key) and includes `generatedAt`/`tokenCount`/`model`/`summary`.
- Used explicit column projection (`SUMMARY_COLUMNS` shared between `select(...)` and `.returning(...)`) instead of `select()` to satisfy the task's "No SELECT *" constraint literally; existing chapter/chunk repos still use `select()` and were left alone (out of scope).

## Learnings

- `@dialogus/ingestion` has a scaffold test (`__tests__/scaffold.test.ts`) that asserts the barrel does not re-export from `infrastructure/`. Feature 003 ADR-006 carves out a single exception for this concrete class — the test was rewritten to assert that the only infrastructure re-export is `DrizzleChapterSummaryRepository`. Future infrastructure leaks will still fail the test.

## Files / Surfaces

- `packages/ingestion/src/infrastructure/persistence/DrizzleChapterSummaryRepository.ts` (new).
- `packages/ingestion/src/infrastructure/persistence/mappers/ChapterSummaryMapper.ts` (new).
- `packages/ingestion/src/index.ts` (barrel: re-export concrete class).
- `packages/ingestion/__tests__/infrastructure/persistence/DrizzleChapterSummaryRepository.test.ts` (new — 8 tests).
- `packages/ingestion/__tests__/scaffold.test.ts` (allow ADR-006 carve-out).

## Errors / Corrections

- Initial test asserted `selectChain.where` was called exactly once for `listMissingChapterIds`, but the inner `notExists` sub-builder shares the same mocked chain in the test double — `where` is observed twice. Asserted only on the outer terminator (`orderBy` called once) instead.

## Ready for Next Run

- Concrete `DrizzleChapterSummaryRepository` is exported from `@dialogus/ingestion` barrel — task_22 (Anthropic generator) and task_23 (summarize stage handler) can import it directly.
