---
status: completed
title: "list_chapters + get_chapter_summary tools"
type: backend
complexity: low
dependencies:
  - task_01
---

# Task 04: list_chapters + get_chapter_summary tools

## Overview

Implement two thin Mastra tools that are near-direct reads on their respective repositories — `list_chapters` (for book navigation + reformulation hints per ADR-003) and `get_chapter_summary` (returning Feature 002's pre-generated summary per ADR-001 + ADR-005). Both tools are small enough to share a task; they ship the same factory pattern as `semantic_search` (Zod-validated input + snake_case output + logger-injected + barrel-exported) without the query-embedding step.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/rag/src/application/tools/listChapters.ts` exporting a factory `listChaptersTool(deps: { chapterRepo: ChapterReadRepository; logger: Logger }): Tool`:
  - `id: 'list_chapters'`; `description`: "List chapters (ordinal + title + token_count) for a book. Use for navigation, reformulation hints, or chapter-range questions."
  - Input: `{ book_id: uuid }`. Output: `{ chapters: [{ chapter_id, ordinal, title, token_count }] }` — snake-case, sorted by `ordinal` ascending.
  - Degenerate-book handling: if the book has a single "Full text" fallback chapter (Feature 002 TxtChapterParser outcome), the tool returns that one chapter; no special handling needed. The agent reads the ordinal + title and composes an appropriate response.
- MUST create `packages/rag/src/application/tools/getChapterSummary.ts` exporting a factory `getChapterSummaryTool(deps: { chapterSummaryRepo: ChapterSummaryReadRepository; logger: Logger }): Tool`:
  - `id: 'get_chapter_summary'`; `description`: "Return a pre-generated summary for a chapter."
  - Input: `{ chapter_id: uuid }`. Output: `{ summary: string, chapter_id, chapter_ordinal, chapter_title, book_id, token_count, model, generated_at }` — all snake-case.
  - Error path: if `chapterSummaryRepo.findByChapterId(id)` returns `null`, throw `SummaryNotFoundError` with a descriptive message; Mastra converts thrown tool errors to tool-error outputs the agent can handle per the refusal behavior in ADR-003.
- Both tools MUST log structured events per TechSpec § Monitoring:
  - `list_chapters`: `{ event: 'tool_call', tool: 'list_chapters', thread_id?, book_id, chapter_count, duration_ms }`.
  - `get_chapter_summary`: `{ event: 'tool_call', tool: 'get_chapter_summary', thread_id?, chapter_id, hit: boolean, duration_ms }`.
- MUST export both factories from the package barrel.
- Both tools MUST reuse the same Zod snake-case DTO conventions as `semantic_search` for consistency.

</requirements>

## Subtasks

- [x] 4.1 Author `listChapters.ts` with input/output schemas + execute.
- [x] 4.2 Author `getChapterSummary.ts` with input/output schemas + execute + error mapping.
- [x] 4.3 Extend package barrel.
- [x] 4.4 Unit tests for both tools with in-memory repository mocks.

## Implementation Details

Reference `task_03.md`'s `semanticSearch.ts` for the factory pattern; the two tools in this task follow the identical layout. The only novel behavior is `get_chapter_summary`'s `null` → `SummaryNotFoundError` conversion — keep that as a single `if (!result) throw new SummaryNotFoundError(...)` line inside the handler.

The `ChapterView` entity (task_01) is shaped to match the tool output already; the mapper is trivial. For `ChapterSummaryView`, fields match 1:1 with the tool output when converted snake-case.

### Relevant Files

- `packages/rag/src/application/tools/semanticSearch.ts` (task_03) — template pattern.
- `packages/rag/src/domain/ports/ChapterReadRepository.port.ts` (task_01).
- `packages/rag/src/domain/ports/ChapterSummaryReadRepository.port.ts` (task_01).
- `packages/rag/src/domain/entities/ChapterView.ts` (task_01).
- `packages/rag/src/domain/entities/ChapterSummaryView.ts` (task_01).
- `packages/rag/src/domain/errors/RagError.ts` (task_01) — `SummaryNotFoundError`.

### Dependent Files

- `packages/rag/src/application/tools/listChapters.ts` (new)
- `packages/rag/src/application/tools/getChapterSummary.ts` (new)
- `packages/rag/src/index.ts` (modify: barrel)
- `packages/rag/__tests__/application/tools/listChapters.test.ts` (new)
- `packages/rag/__tests__/application/tools/getChapterSummary.test.ts` (new)

### Related ADRs

- [ADR-001: Feature 003 is agent-only; summaries owned by 002](adrs/adr-001.md) — `get_chapter_summary` relies on 002's amendment.
- [ADR-005: chapter_summaries dedicated table](adrs/adr-005.md) — data source for `get_chapter_summary`.

## Deliverables

- Two tool factory files.
- Barrel extended.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_09.

## Tests

- Unit tests (`list_chapters`):
  - [x] Happy path: `execute({ book_id: '<uuid>' })` with 3 chapters in repo → output contains 3 entries in ordinal order.
  - [x] Empty book: repo returns `[]` → output `chapters: []`.
  - [x] Single "Full text" chapter: repo returns 1 entry → output contains 1 entry, `title` is what the parser emitted.
  - [x] Zod input: non-UUID `book_id` → rejected before repo call.
  - [x] Logging: successful call emits `chapter_count` in the log line.
- Unit tests (`get_chapter_summary`):
  - [x] Happy path: `execute({ chapter_id: '<uuid>' })` with a summary in repo → returns snake-case DTO with `summary`, `chapter_ordinal`, `chapter_title`, `book_id`, `model`, `generated_at` (ISO string).
  - [x] Missing summary: repo returns `null` → throws `SummaryNotFoundError` with a message mentioning the `chapter_id`.
  - [x] Zod input: non-UUID `chapter_id` → rejected before repo call.
  - [x] Logging: `hit: true` on success; `hit: false` is NOT logged on error (error path throws before log emit).
- Integration tests:
  - [ ] Deferred to task_09.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Both tool factories compile as drop-in equivalents of `semantic_search`'s shape (agent factory in task_07 can assemble all four tools with identical wiring)
- `SummaryNotFoundError` surfaces with enough context to diagnose (chapter_id included in the message)
