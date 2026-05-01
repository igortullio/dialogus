---
status: completed
title: DrizzleChapterSummaryRepository + mapper
type: backend
complexity: low
dependencies:
  - task_19
  - task_20
---

# Task 21: DrizzleChapterSummaryRepository + mapper

## Overview

Implement the Drizzle adapter for `ChapterSummaryRepository` inside `@dialogus/ingestion`, alongside `DrizzleChapterRepository` and `DrizzleChunkRepository` from task_05. Ship the mapper `ChapterSummaryMapper` (domain↔db) and unit tests against a mocked Drizzle client. This adapter is the one Feature 003 will import and satisfy via structural typing (Feature 003 ADR-006) — so the method shapes must stay in lockstep with Feature 003's `ChapterSummaryReadRepository` port.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `packages/ingestion/src/infrastructure/persistence/DrizzleChapterSummaryRepository.ts` satisfying `ChapterSummaryRepository` (task_20):
  - `save(summary)` uses Drizzle's `insert ... onConflictDoUpdate` on `chapter_id` (upsert semantics per the unique constraint).
  - `findByChapterId(id)` returns a `ChapterSummary | null` with the book_id + chapter_id + summary + metadata.
  - `listMissingChapterIds(bookId)` returns `string[]` of chapter IDs for the book that do NOT have a row in `chapter_summaries` — used by the summarize stage's idempotent resume logic.
- MUST implement `packages/ingestion/src/infrastructure/persistence/mappers/ChapterSummaryMapper.ts` with `toDomain(row): ChapterSummary` + `toPersistence(entity): ChapterSummariesInsertShape`.
- MUST export the concrete class from the package barrel (`packages/ingestion/src/index.ts`) so Feature 003's `apps/mastra` can import it directly per ADR-006.
- Query for `listMissingChapterIds` must be a single SQL round-trip (e.g., `SELECT chapter_id FROM chapters c WHERE c.book_id = $1 AND NOT EXISTS (SELECT 1 FROM chapter_summaries s WHERE s.chapter_id = c.id)`) rather than two queries + app-layer diff.
- No SELECT * — explicit column lists in every Drizzle query.

</requirements>

## Subtasks

- [x] 21.1 Implement `ChapterSummaryMapper.ts`.
- [x] 21.2 Implement `DrizzleChapterSummaryRepository.ts`.
- [x] 21.3 Extend package barrel export.
- [x] 21.4 Unit tests with mocked Drizzle client.

## Implementation Details

`onConflictDoUpdate` on the `chapter_id` unique constraint lets regeneration overwrite cleanly without a separate delete+insert cycle. This matters for Phase 2's `books:resummarize` CLI — it will call `save()` repeatedly on the same chapter and expect idempotency.

Sample query shape for `listMissingChapterIds` (reference only; illustrate the join strategy):

```sql
SELECT c.id FROM chapters c
WHERE c.book_id = $1
  AND NOT EXISTS (
    SELECT 1 FROM chapter_summaries s WHERE s.chapter_id = c.id
  )
ORDER BY c.ordinal;
```

### Relevant Files

- Feature 002 ADR-008: [Stage + repository shape](adrs/adr-008.md).
- Feature 003 ADR-006: [Structural typing requirement](../003-rag-agent/adrs/adr-006.md).
- `packages/ingestion/src/infrastructure/persistence/DrizzleChapterRepository.ts` (from task_05 — template for this adapter).
- `packages/ingestion/src/infrastructure/persistence/mappers/ChapterMapper.ts` (from task_05 — template).

### Dependent Files

- `packages/ingestion/src/infrastructure/persistence/DrizzleChapterSummaryRepository.ts` (new)
- `packages/ingestion/src/infrastructure/persistence/mappers/ChapterSummaryMapper.ts` (new)
- `packages/ingestion/src/index.ts` (modify: barrel re-export the class)

### Related ADRs

- [Feature 002 ADR-008](adrs/adr-008.md) — seventh stage motivates this adapter.
- [Feature 003 ADR-006](../003-rag-agent/adrs/adr-006.md) — Feature 003 will depend on this adapter via `@dialogus/ingestion`.

## Deliverables

- Adapter + mapper + barrel export.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_23 (stage handler) + task_16 (pipeline integration).

## Tests

- Unit tests (mocked Drizzle client):
  - [x] `save()` with new summary → insert executed with correct column values.
  - [x] `save()` with existing chapter_id → `onConflictDoUpdate` executed.
  - [x] `findByChapterId(id)` with existing → returns mapped entity.
  - [x] `findByChapterId(id)` with unknown → returns `null`.
  - [x] `listMissingChapterIds(bookId)` → returns array of UUIDs in ordinal order.
  - [x] `listMissingChapterIds(bookId)` on book with all summaries → returns `[]`.
  - [x] Mapper round-trip: `toDomain(toPersistence(entity)).equals(entity)` for a sample.
- Integration tests:
  - [ ] Deferred to task_23 / task_16.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Method shapes match Feature 003's `ChapterSummaryReadRepository` structurally (TypeScript compiles when the concrete class is passed where the port is expected)
- No SQL lands in tests (mocks only); real DB exercised in task_23/task_16
