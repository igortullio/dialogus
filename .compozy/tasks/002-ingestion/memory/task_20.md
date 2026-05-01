# Task Memory: task_20.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Domain-only addition for ADR-008's summarize stage: `ChapterSummary` entity, `ChapterSummaryRepository` + `ChapterSummaryGenerator` ports, new `SummarizeError`, plus barrel re-exports. No infrastructure or use-case work.

## Important Decisions

- `ChapterSummaryGenerator.generate(chapter, language)` typed `language: SupportedLanguage` (the existing alias for `'en' | 'pt'`) for consistency with `ChapterParser.parse`. Structurally identical to the spec's `'en' | 'pt'` literal.
- Result shape exposed as a named `ChapterSummaryGeneration` interface so adapters/tests can name it explicitly; barrel re-exports it alongside the port.
- `SummarizeError` defaults `retryable: true` (Anthropic upstream is the primary failure mode per ADR-008 § Risks) and uses code `INGESTION_SUMMARIZE_FAILED` aligning with the shared `ingestion-summarize-failed` problem slug already in `_techspec.md`.

## Learnings

- `expectTypeOf` is unused elsewhere in this repo; structural type assertions via typed assignments + `Object.keys(...).sort()` shape checks fit the existing test style.
- Biome's `useFunctionType`/import sort auto-fix re-orders the test imports — kept the auto-fixed form.

## Files / Surfaces

- `packages/ingestion/src/domain/chapter_summary/ChapterSummary.ts` (new)
- `packages/ingestion/src/domain/chapter_summary/ChapterSummaryRepository.port.ts` (new)
- `packages/ingestion/src/domain/chapter_summary/ChapterSummaryGenerator.port.ts` (new)
- `packages/ingestion/src/domain/ingestion/IngestionError.ts` (modified — `SummarizeError` added)
- `packages/ingestion/src/index.ts` (modified — barrel re-exports)
- `packages/ingestion/__tests__/domain/chapter_summary/types.test.ts` (new — 6 tests)

## Errors / Corrections

- None.

## Ready for Next Run

- task_21 (Drizzle repository) can `import type { ChapterSummary, ChapterSummaryRepository }` from `@dialogus/ingestion` and reuse `chapterSummaries` from `@dialogus/db`.
- task_22 (generator adapters) can implement `ChapterSummaryGenerator` against the published port; result-type alias is `ChapterSummaryGeneration`.
- task_23 (summarize stage handler) should map thrown `SummarizeError` directly to the existing `ingestion-summarize-failed` problem slug.
