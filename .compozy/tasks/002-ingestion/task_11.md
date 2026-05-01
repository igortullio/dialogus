---
status: completed
title: Parse stage handler
type: backend
complexity: medium
dependencies:
  - task_05
  - task_08
  - task_09
---

# Task 11: Parse stage handler

## Overview

Implement `ingestion.parse` (stage 3): reads `./storage/clean/<gutendex_id>.txt` and the book's language, chooses EPUB or TXT parser based on the raw file extension from stage 1 (prefer EPUB against `./storage/raw/...`; fall back to TXT parse against `./storage/clean/...`), streams chapters into the `chapters` table incrementally via `DrizzleChapterRepository.saveMany()`, and enqueues `ingestion.chunk` on success.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `packages/ingestion/src/application/stages/parse.ts` as a function `parseStage(payload: StagePayload, deps: StageDeps): Promise<void>`.
- Read book row; update `ingestion_status='parsing'`, `ingestion_progress=0`, `ingestion_last_stage='parse'`.
- Upstream "already done?" check: if `chapters WHERE book_id = $1` count > 0, skip to enqueue `ingestion.chunk`.
- Select parser based on raw file extension: `.epub` → `EpubChapterParserWithFallback` (from task_09); otherwise `.txt` → `TxtChapterParser` (from task_08).
- EPUB parsing reads from `./storage/raw/<gutendex_id>.epub`; TXT parsing reads from `./storage/clean/<gutendex_id>.txt`.
- Stream iteration: `for await (const chapter of parser.parse(path, language))`, buffer chapters in batches of 50, call `chapterRepo.saveMany(batch)` per batch, update `ingestion_progress` proportional to some heuristic (e.g., chapter count estimate; acceptable to just report progress as a count of chapters inserted).
- On failure (parser throws `ParseError` or other), update `ingestion_status='failed'`, `ingestion_error=<slug + message>`, rethrow.
- On success, enqueue `ingestion.chunk`.
- MUST detect "no chapters found" pathological case (count = 0 at end of streaming) and throw `ParseError` with slug `ingestion-parse-failed`.

</requirements>

## Subtasks

- [x] 11.1 Implement parser-selection logic based on raw file extension.
- [x] 11.2 Stream chapters via the port's `AsyncIterable`, batch-save every 50.
- [x] 11.3 Implement the "count = 0 at end" pathological detection.
- [x] 11.4 Pino log per batch with `{ book_id, batch_size, chapters_persisted_so_far }`.
- [x] 11.5 Unit tests covering EPUB path, TXT path, fallback parser invoked, empty-chapters failure.

## Implementation Details

Reference Feature 002 TechSpec § Data Flow step 4 (parse stage bullet) + § Testing Approach (parse expectations). The stage handler uses `ChapterParser` port — not a specific parser — with the port injected via `deps.chapterParser` (for EPUB path) and a second `deps.txtChapterParser` for TXT. Alternatively, inject a factory/selector; pick one pattern in implementation.

### Relevant Files

- `packages/ingestion/src/infrastructure/parsing/EpubChapterParserWithFallback.ts` (task_09).
- `packages/ingestion/src/infrastructure/parsing/TxtChapterParser.ts` (task_08).
- `packages/ingestion/src/infrastructure/persistence/DrizzleChapterRepository.ts` (task_05).
- Feature 002 TechSpec § Data Flow + Implementation Design.

### Dependent Files

- `packages/ingestion/src/application/stages/parse.ts` (new)
- `packages/ingestion/__tests__/application/stages/parse.test.ts` (new)

### Related ADRs

- [ADR-001: Chained pg-boss jobs](adrs/adr-001.md) — parse enqueues chunk.
- [ADR-003: Resume](adrs/adr-003.md) — upstream-check via `chapters.countByBookId`.
- [ADR-004: Streaming](adrs/adr-004.md) — streaming iteration + batch inserts.
- [ADR-006: YAML heuristics](adrs/adr-006.md) — used indirectly via `TxtChapterParser`.

## Deliverables

- Parse stage handler implemented.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_16 (`ingestion-happy.integration.test.ts` exercises full path).

## Tests

- Unit tests:
  - [ ] EPUB path: mock book with `./storage/raw/<id>.epub`, mock `EpubChapterParserWithFallback.parse` yielding 3 chapters → `chapterRepo.saveMany` called once with 3 chapters; enqueues `ingestion.chunk`.
  - [ ] TXT path: mock book with `./storage/raw/<id>.txt` (no EPUB URL from Gutendex); mock `TxtChapterParser.parse` → same flow.
  - [ ] Batching: 100 mocked yielded chapters → `saveMany` called 2 times (50 + 50).
  - [ ] Upstream check: mocked `chapterRepo.countByBookId` returns 5 → handler SKIPS parsing, directly enqueues `ingestion.chunk`.
  - [ ] Empty chapters pathological: mocked parser yields 0 chapters → `parseStage` throws `ParseError` with slug `ingestion-parse-failed`.
  - [ ] Parser throws mid-iteration → handler sets `ingestion_status='failed'`, rethrows.
  - [ ] Progress updates emitted at batch boundaries (verify via `books.update` mock call count ≥ 2 for a multi-batch book).
- Integration tests:
  - [ ] Deferred to task_16 (real fixture EPUB/TXT + real Postgres).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Streaming: parser reads file progressively; chapters persisted incrementally rather than after full parse.
- "No chapters" always surfaces as `ParseError`, never silently as an empty chapter list.
