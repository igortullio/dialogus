# Task Memory: task_24.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Wire the summarize stage into `apps/worker`, retire the `registerSummarizeBridge` test helper, and grow ingestion integration suites to exercise the full 7-stage pipeline (including summarize-failure retry + EN/PT language plumbing).

## Important Decisions

- Built `apps/worker/src/handlers/ingestion-summarize.ts` as a thin factory over `summarizeStage`; binds `stage: 'summarize'` on the logger via `logger.child()` so structured logs match the other handlers.
- Extended `composeStageDeps` with `selectSummaryGenerator` (mirror of `selectEmbeddingProvider`): env `SUMMARY_GENERATOR=mock|anthropic`, defaults to `anthropic` in production, `mock` otherwise. Anthropic missing key throws `SummaryGeneratorConfigError` — fail-fast at boot.
- `ComposedStageDeps` gained `chapterSummaryRepo`, `chapterSummaryGenerator`, and `summaryGenerator` (selection record). The summarize handler uses the explicit fields instead of forcing them onto `StageDeps`, matching the use case's narrowed shape.
- Updated `MockChapterSummaryGenerator` output to include `[lang=<en|pt>]`. This is required for the language-plumbing integration test and is recorded in the existing unit test.
- Retired `apps/api/__tests__/integration/_helpers/setup.ts:registerSummarizeBridge` and the local `PgBoss` import; `startTestWorker` now passes a `chapterSummaryGenerator` override.
- Retry integration test now covers summarize-stage failure (was embed-stage). Uses synthetic 25k-word / 5-chapter book; `FailOnceSummaryGenerator(failOnOrdinal: 3)` produces the failure on chapter 3 (TxtChapterParser starts ordinals at 1).

## Learnings

- `TxtChapterParser` increments `ordinal` BEFORE yielding (line 52 in `_common.ts` neighbouring file), so the first chapter gets ordinal `1`, not `0`. Tests that assume zero-indexed ordinals will be off by one.
- Biome organizeImports treats `type X` and value imports as separate sort buckets; named alphabetical order applies inside each. Letting `pnpm lint:fix` run is faster than hand-sorting.
- The Mock summary string format change rippled into one unit test only (`MockChapterSummaryGenerator.test.ts`); the application-layer summarize tests use an inline mock with their own format.
- Integration suite wall-clock: 8 files / 19 tests / 32s on this machine — well under the 15-minute CI budget.

## Files / Surfaces

- `apps/worker/src/handlers/ingestion-summarize.ts` (new), `__tests__/handlers/ingestion-summarize.test.ts` (new).
- `apps/worker/src/index.ts`, `apps/worker/src/deps.ts`, `apps/worker/__tests__/{boot,deps}.test.ts` (modified).
- `apps/worker/.env.example`, `apps/worker/README.md` (new).
- `apps/api/__tests__/integration/_helpers/setup.ts` (deleted summarize bridge; added `chapterSummaryGenerator` option).
- `apps/api/__tests__/integration/ingestion-happy.integration.test.ts` (asserts chapter_summaries count).
- `apps/api/__tests__/integration/ingestion-retry.integration.test.ts` (rewritten for summarize failure).
- `apps/api/__tests__/integration/summarize-language.integration.test.ts` (new).
- `packages/ingestion/src/infrastructure/external/MockChapterSummaryGenerator.ts` (+`[lang=…]` marker).

## Errors / Corrections

- `GutendexDownloader` "minTime=1000ms" test failed at 999ms once during the verification run (known flake — re-ran the suite, passed). No regression introduced by this task.

## Ready for Next Run

- Task 18 (smoke + closure) is unblocked.
