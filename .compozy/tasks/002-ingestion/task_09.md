---
status: completed
title: EpubChapterParser (gxl + epub2 fallback)
type: backend
complexity: medium
dependencies:
  - task_04
---

# Task 9: EpubChapterParser (gxl + epub2 fallback)

## Overview

Implement the EPUB path of the `ChapterParser` port with two adapters — `EpubChapterParser` using `@gxl/epub-parser` as primary and `EpubChapterParserEpub2` using `epub2` as fallback — plus a runtime fallback wrapper that tries the primary first and delegates to the fallback on failure. Both adapters stream-yield `ParsedChapter` objects via the port's async-iterable contract.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `packages/ingestion/src/infrastructure/parsing/EpubChapterParser.ts` using `@gxl/epub-parser`: iterates spine + TOC to extract chapters; yields `ParsedChapter` per chapter as parsing progresses.
- MUST implement `packages/ingestion/src/infrastructure/parsing/EpubChapterParserEpub2.ts` using `epub2` package with the same port interface; yields the same shape.
- MUST implement `packages/ingestion/src/infrastructure/parsing/EpubChapterParserWithFallback.ts` — a wrapper implementing `ChapterParser` that tries `EpubChapterParser` first, catches thrown errors, and retries with `EpubChapterParserEpub2`. Logs which parser succeeded for each file.
- Every adapter MUST compute `tokenCount` per chapter via `js-tiktoken` (cl100k_base), same as `TxtChapterParser` in task_08.
- Both adapters MUST be tolerant of missing `title` on a spine entry — derive from filename or use "Chapter N".
- MUST commit at least 2 small fixture EPUB files under `packages/ingestion/__fixtures__/epub/`: one EN (Public Domain classic) + one PT (public domain classic), chosen to be small enough for fast tests (under 200KB each).
- `language` parameter to `parse(rawFilePath, language)` is currently unused in EPUB path (EPUB has its own `<dc:language>`), but accepted for port-interface conformity.
- Add `@gxl/epub-parser@^2` + `epub2@^3` to `packages/ingestion/package.json` deps.

</requirements>

## Subtasks

- [x] 9.1 Implement `EpubChapterParser` (gxl).
- [x] 9.2 Implement `EpubChapterParserEpub2`.
- [x] 9.3 Implement `EpubChapterParserWithFallback` wrapper.
- [x] 9.4 Commit 2 small fixture EPUB files.
- [x] 9.5 Unit tests covering both parsers + the fallback logic.

## Implementation Details

Reference Feature 002 TechSpec § Technical Considerations key decision on parser choice. The `@gxl/epub-parser` returns a parsed structure; iterate `sections` or equivalent.

### Relevant Files

- `packages/ingestion/src/domain/parser/ChapterParser.port.ts` (task_04).
- `packages/ingestion/src/infrastructure/parsing/TxtChapterParser.ts` (task_08) — analog for TXT; same `ParsedChapter` shape.
- `@gxl/epub-parser` GitHub documentation (reference during implementation).

### Dependent Files

- `packages/ingestion/src/infrastructure/parsing/EpubChapterParser.ts` (new)
- `packages/ingestion/src/infrastructure/parsing/EpubChapterParserEpub2.ts` (new)
- `packages/ingestion/src/infrastructure/parsing/EpubChapterParserWithFallback.ts` (new)
- `packages/ingestion/__fixtures__/epub/sample-en.epub` (new, small EN public domain EPUB)
- `packages/ingestion/__fixtures__/epub/sample-pt.epub` (new, small PT public domain EPUB)
- `packages/ingestion/package.json` (modify: add `@gxl/epub-parser`, `epub2`)
- `packages/ingestion/__tests__/infrastructure/parsing/EpubChapterParser.test.ts` (new)
- `packages/ingestion/__tests__/infrastructure/parsing/EpubChapterParserEpub2.test.ts` (new)
- `packages/ingestion/__tests__/infrastructure/parsing/EpubChapterParserWithFallback.test.ts` (new)

## Deliverables

- 3 EPUB adapters (primary, fallback, wrapper).
- 2 fixture EPUB files committed.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_11 + task_16.

## Tests

- Unit tests:
  - [x] `EpubChapterParser.parse(sampleEnFixture, 'en')` yields ≥ 2 chapters with non-empty `plainText` and `title`.
  - [x] `EpubChapterParser.parse(samplePtFixture, 'pt')` yields ≥ 2 chapters.
  - [x] `EpubChapterParserEpub2.parse(sampleEnFixture, 'en')` yields ≥ 2 chapters with same shape.
  - [x] `EpubChapterParser.parse(corruptedEpubFixture)` throws `ParseError`.
  - [x] `EpubChapterParserWithFallback`: primary throws → fallback succeeds → yields chapters; log line at `warn` level indicates fallback used.
  - [x] `EpubChapterParserWithFallback`: both throw → throws `ParseError` with message indicating both parsers failed.
  - [x] Token count computed via `js-tiktoken` for every yielded chapter.
  - [x] Streaming: yielded chapters become available as parsing progresses (first `yield` fires before all chapters are processed — assert via async iterator consumed incrementally).
- Integration tests:
  - [ ] Deferred to task_11 / task_16.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Both EN and PT sample EPUBs parse to correct chapter structure.
- Fallback wrapper is the one injected into stage handlers — not a raw parser — so any parse failure fails loudly only after both attempts.
