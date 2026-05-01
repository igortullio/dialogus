---
status: completed
title: Summarize stage handler (use case)
type: backend
complexity: medium
dependencies:
  - task_21
  - task_22
---

# Task 23: Summarize stage handler (use case)

## Overview

Implement the `summarize` stage as an application-layer use case in `@dialogus/ingestion` per Feature 002 ADR-008: the fifth stage in the newly-ordered pipeline (download → clean → parse → chunk → **summarize** → embed → index). Handler reads chapters needing summaries via `listMissingChapterIds`, generates summaries via `ChapterSummaryGenerator`, persists via `ChapterSummaryRepository`, updates `books.ingestion_status` to `'summarizing'` → `'embedding'`, and enqueues `ingestion.embed` on completion. Extends the Zod `IngestionStatus` enum with `'summarizing'`.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/ingestion/src/application/stages/summarize.ts` implementing `StageHandler` (task_04 contract):
  - Input: `{ bookId }`.
  - Steps: (1) set `books.ingestion_status = 'summarizing'`, `ingestion_last_stage = 'summarize'`; (2) fetch `books.languages[0]` for language param; (3) `chapterSummaryRepo.listMissingChapterIds(bookId)`; (4) for each missing chapter, fetch `ParsedChapter` via `chapterRepo.findByBookIdAndOrdinal(...)` or similar, call `chapterSummaryGenerator.generate(chapter, language)`, save via `chapterSummaryRepo.save(...)`; (5) update `ingestion_progress` per-chapter; (6) on completion, enqueue `boss.send('ingestion.embed', { bookId })`.
  - Idempotent: re-runnable; only generates for chapters currently missing; existing summaries are preserved.
  - Streaming-compliant (ADR-004): iterates chapters one at a time; never loads all chapters into memory.
- MUST extend `@dialogus/shared/schemas/ingestion.ts` (from task_01) to add `'summarizing'` to the `IngestionStatus` Zod enum, in order between `'chunking'` and `'embedding'`. All `IngestionStatus` consumers (Zod-validated API endpoints) must accept the new value.
- MUST add the problem slug `ingestion-summarize-failed` (503, retryable) to the `problem.ts` middleware enumeration (from Feature 001 task_06 + task_14).
- MUST handle `SummarizeError` from the generator gracefully: sets `books.ingestion_status = 'failed'`, `ingestion_error = <message>`, `ingestion_last_stage = 'summarize'`; does NOT re-throw (handler returns cleanly so pg-boss marks the job success, then retry via `/ingest/retry` flows correctly).
- MUST log structured events per Feature 002 TechSpec Monitoring section: stage transitions (chapter-level progress), failures (with retryable + slug + book_id + chapter_id).
- MUST emit the `books.ingestion_progress` value as `(chapters_summarized / total_chapters) * 100` rounded to int — consistent with other stages.

</requirements>

## Subtasks

- [x] 23.1 Extend `IngestionStatus` enum in `@dialogus/shared/schemas/ingestion.ts` (already in place from task_01) and add `summarizing` to `packages/db/src/schema/books.ts` + migration `0006_books_status_summarizing.sql` + `packages/catalog/src/domain/book/IngestionStatus.ts`.
- [x] 23.2 Implement `summarize.ts` use case.
- [x] 23.3 Wire the new problem slug `ingestion-summarize-failed` (503, retryable) into `apps/api` problem middleware.
- [x] 23.4 Unit tests (in-memory ports) — `packages/ingestion/__tests__/application/stages/summarize.test.ts`.
- [x] 23.5 Integration test: `apps/api/__tests__/integration/summarize.integration.test.ts` against Testcontainers + `MockChapterSummaryGenerator`.

## Implementation Details

Chapter iteration strategy: rather than pre-loading all chapters, the handler pulls missing chapter IDs first (via `listMissingChapterIds`), then loops through them, fetching one `ParsedChapter` at a time. This matches the streaming discipline enforced by feature ADR-004 even though summaries per-chapter are small enough to fit in memory individually.

The `books.ingestion_progress` update per chapter is a trade-off: it lets the UI show smooth progress on a 365-chapter book but multiplies row writes by the chapter count. For large books this is acceptable; if profiling later shows it's a hotspot, batch the progress update every N chapters.

### Relevant Files

- Feature 002 ADR-008: [Seventh stage definition + failure semantics](adrs/adr-008.md).
- `packages/ingestion/src/domain/chapter_summary/ChapterSummaryGenerator.port.ts` (task_20).
- `packages/ingestion/src/domain/chapter_summary/ChapterSummaryRepository.port.ts` (task_20).
- `packages/ingestion/src/infrastructure/persistence/DrizzleChapterSummaryRepository.ts` (task_21).
- `packages/ingestion/src/infrastructure/external/{Anthropic,Mock}ChapterSummaryGenerator.ts` (task_22).
- `packages/ingestion/src/application/stages/chunk.ts` (task_12 — this task's edit changes the next-stage enqueue from `ingestion.embed` to `ingestion.summarize`; verify that edit lands before this task merges).
- `packages/ingestion/src/application/stages/embed.ts` (task_13 — no semantic change; embed is reached from summarize instead of chunk directly).
- `packages/shared/src/schemas/ingestion.ts` (task_01 — extend enum).
- `apps/api/src/infrastructure/http/middleware/problem.ts` (Feature 001 + task_14 — extend slug enum).

### Dependent Files

- `packages/shared/src/schemas/ingestion.ts` (modify: enum)
- `packages/ingestion/src/application/stages/summarize.ts` (new)
- `apps/api/src/infrastructure/http/middleware/problem.ts` (modify: slug)
- `packages/ingestion/__tests__/application/stages/summarize.test.ts` (new)
- `apps/api/__tests__/integration/summarize.integration.test.ts` (new)

### Related ADRs

- [Feature 002 ADR-008](adrs/adr-008.md) — primary reference.
- [Feature 002 ADR-003](adrs/adr-003.md) — resume semantics inherited.
- [Feature 002 ADR-004](adrs/adr-004.md) — streaming discipline inherited.

## Deliverables

- Enum extension, stage implementation, problem slug, 1 unit test file + 1 integration test file.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)**.

## Tests

- Unit tests (in-memory ports + mock generator):
  - [ ] Happy path: 3 chapters missing summaries → 3 `generate()` calls → 3 `save()` calls → `ingestion.embed` enqueued.
  - [ ] Resume path: 2/3 chapters already summarized → 1 `generate()` call → 1 `save()` call → `ingestion.embed` enqueued.
  - [ ] All summarized: 0 `generate()` calls → `ingestion.embed` enqueued immediately.
  - [ ] Generator throws `SummarizeError` on chapter 2 of 3: `books.ingestion_status = 'failed'`, `ingestion_error` populated, `ingestion_last_stage = 'summarize'`, no `ingestion.embed` enqueued, first chapter's summary persisted.
  - [ ] Language param passed correctly: EN book → `generate(..., 'en')`; PT book → `generate(..., 'pt')`.
  - [ ] Progress update per chapter: 3 chapters → `ingestion_progress` values 33, 66, 100 (or equivalent rounded).
  - [ ] Zod enum includes `'summarizing'`; invalid string (e.g., `'summarise'`) rejected.
  - [ ] Problem middleware emits slug `ingestion-summarize-failed` for `SummarizeError`.
- Integration tests (Testcontainers + `MockChapterSummaryGenerator`):
  - [ ] Full stage: seed book + 5 chapters (no summaries) → invoke `summarize` handler → 5 `chapter_summaries` rows exist → `ingestion_status = 'embedding'` (stage completed, transitioning forward).
  - [ ] Resume: seed book + 5 chapters + 2 existing summaries → invoke handler → total 5 summaries exist (existing 2 untouched).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Language-match behavior validated for both EN and PT fixtures
- Integration test produces 5 real `chapter_summaries` rows against Testcontainers
- Stage is idempotent (running it twice on a `ready` book is a no-op that still enqueues `ingestion.embed` — which itself would be a no-op for a fully-embedded book)
