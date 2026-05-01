---
status: completed
title: "@dialogus/ingestion ChapterSummary domain layer"
type: backend
complexity: low
dependencies:
  - task_04
---

# Task 20: @dialogus/ingestion ChapterSummary domain layer

## Overview

Add the domain layer for chapter summaries inside `@dialogus/ingestion` per Feature 002 ADR-008: the `ChapterSummary` entity, the `ChapterSummaryRepository` port, the `ChapterSummaryGenerator` port (the LLM-agnostic abstraction), and a new `SummarizeError` class. No infrastructure or use-case logic in this task — those are subsequent tasks 21, 22, 23. Domain layer only.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/ingestion/src/domain/chapter_summary/ChapterSummary.ts` — entity with fields matching the `chapter_summaries` table: `id`, `chapterId`, `bookId`, `summary`, `tokenCount`, `model`, `generatedAt`. TypeScript `readonly` on every field.
- MUST create `packages/ingestion/src/domain/chapter_summary/ChapterSummaryRepository.port.ts` — port with:
  - `save(summary: ChapterSummary): Promise<ChapterSummary>` — upsert by `chapterId` unique constraint.
  - `findByChapterId(chapterId: string): Promise<ChapterSummary | null>` — narrow read used by Feature 003's `get_chapter_summary` tool (matches Feature 003 `ChapterSummaryReadRepository` shape structurally).
  - `listMissingChapterIds(bookId: string): Promise<string[]>` — used by the summarize stage to find chapters that need generation on resume.
- MUST create `packages/ingestion/src/domain/chapter_summary/ChapterSummaryGenerator.port.ts` — port with:
  - `generate(chapter: ParsedChapter, language: 'en' | 'pt'): Promise<{ summary: string; tokenCount: number; model: string }>` — abstraction over the LLM call.
- MUST extend `packages/ingestion/src/domain/ingestion/IngestionError.ts` (created in task_04) with `SummarizeError` class — subclass of the ingestion error hierarchy.
- MUST extend the barrel `packages/ingestion/src/index.ts` to export the new domain types as public API (ports + entity + error).

</requirements>

## Subtasks

- [x] 20.1 Author `ChapterSummary.ts` entity.
- [x] 20.2 Author `ChapterSummaryRepository.port.ts`.
- [x] 20.3 Author `ChapterSummaryGenerator.port.ts`.
- [x] 20.4 Extend `IngestionError.ts` with `SummarizeError`.
- [x] 20.5 Update barrel exports.

## Implementation Details

The `ChapterSummaryGenerator` port takes a `ParsedChapter` (already defined in task_04 under `ChapterParser.port.ts`) so the generator has access to both the plain text and the token count. The `language` param lets the adapter instruct the LLM to summarize in the chapter's source language (Feature 003 ADR-002 handles user-facing language; the summary itself follows the book).

### Relevant Files

- Feature 002 ADR-008: [Seventh stage + summary generator port](adrs/adr-008.md).
- Feature 003 ADR-005: [chapter_summaries schema](../003-rag-agent/adrs/adr-005.md).
- `packages/ingestion/src/domain/parser/ChapterParser.port.ts` (from task_04) — provides `ParsedChapter` type.
- `packages/ingestion/src/domain/ingestion/IngestionError.ts` (from task_04) — hierarchy to extend.

### Dependent Files

- `packages/ingestion/src/domain/chapter_summary/ChapterSummary.ts` (new)
- `packages/ingestion/src/domain/chapter_summary/ChapterSummaryRepository.port.ts` (new)
- `packages/ingestion/src/domain/chapter_summary/ChapterSummaryGenerator.port.ts` (new)
- `packages/ingestion/src/domain/ingestion/IngestionError.ts` (modify: add SummarizeError)
- `packages/ingestion/src/index.ts` (modify: barrel)

### Related ADRs

- [Feature 002 ADR-008](adrs/adr-008.md) — this task implements the domain-level portion.
- [Feature 003 ADR-005](../003-rag-agent/adrs/adr-005.md) — ensures entity shape matches the table.
- [Feature 003 ADR-006](../003-rag-agent/adrs/adr-006.md) — the narrow `findByChapterId` method is what Feature 003's `ChapterSummaryReadRepository` port structurally matches.

## Deliverables

- Entity + 2 ports + 1 new error class.
- Barrel updated.
- Unit tests with 80%+ coverage **(REQUIRED)** — type smoke tests.
- Integration tests **(REQUIRED)** — deferred to task_23 (summarize stage handler).

## Tests

- Unit tests:
  - [x] `packages/ingestion/__tests__/domain/chapter_summary/types.test.ts` — imports the entity + ports; asserts TypeScript compilation (structural checks) + `SummarizeError` extends the ingestion error base + barrel re-exports everything expected.
- Integration tests:
  - [ ] Deferred to task_23.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Domain layer has zero infrastructure imports (port-only file contents)
- `ChapterSummary` entity fields match `chapter_summaries` table columns 1:1
