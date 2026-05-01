---
status: completed
title: YAML heuristics + GutenbergCleaner + TxtChapterParser
type: backend
complexity: medium
dependencies:
  - task_04
---

# Task 8: YAML heuristics + GutenbergCleaner + TxtChapterParser

## Overview

Author the `chapter-heuristics.yaml` data file + its Zod schema + loader (ADR-006), implement `GutenbergCleaner` that strips Project Gutenberg boilerplate from raw text, and implement `TxtChapterParser` (one of the two `ChapterParser` port implementations) that applies the YAML-loaded regex patterns per language to detect chapter boundaries in plain-text dumps.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/ingestion/src/infrastructure/parsing/chapter-heuristics.yaml` with starter patterns per Feature 002 ADR-006 decision block (EN + PT each with ≥ 3 patterns + fallback_title).
- MUST create a Zod schema `ChapterHeuristicsSchema` in `packages/ingestion/src/infrastructure/parsing/chapter-heuristics.ts` that validates the YAML structure at boot; compiles string patterns into `RegExp[]`.
- Loader function `loadChapterHeuristics(): ChapterHeuristicsConfig` reads + parses + compiles once per process; cached in a module-level singleton.
- MUST implement `packages/ingestion/src/infrastructure/parsing/GutenbergCleaner.ts` as a pure function `clean(rawText: string): string` that: strips everything before `*** START OF ... ***` (case-insensitive), everything after `*** END OF ... ***`, normalizes consecutive blank lines to max 2, trims leading/trailing whitespace.
- `GutenbergCleaner` MUST operate in a streaming-friendly manner if input is large: either accept a line-based async iterator or process in chunks. Simpler implementation (whole-string) is acceptable for V1 since `./storage/raw/*` is read from disk per-call; just don't accumulate two copies in memory.
- MUST implement `packages/ingestion/src/infrastructure/parsing/TxtChapterParser.ts` satisfying `ChapterParser` port: `parse(rawFilePath, language)` returns `AsyncIterable<ParsedChapter>` that streams line-by-line, detects chapter headers via the language's compiled patterns, and yields `ParsedChapter` objects as chapter bodies accumulate.
- TxtChapterParser fallback: if zero chapter headers detected, yield a single `ParsedChapter` with `fallbackTitle` from YAML + whole body as `plainText`.
- Token count per chapter computed via `js-tiktoken` (cl100k_base encoding; same family as OpenAI text-embedding-3).
- Add `yaml@^2` + `js-tiktoken@^1` to `packages/ingestion/package.json` deps.
- MUST commit 3 EN + 3 PT fixture text files under `packages/ingestion/__fixtures__/txt/` for downstream testing (task_10, task_11).

</requirements>

## Subtasks

- [x] 8.1 Author `chapter-heuristics.yaml` with starter EN + PT patterns.
- [x] 8.2 Implement Zod schema + loader with pattern compilation.
- [x] 8.3 Implement `GutenbergCleaner.clean()`.
- [x] 8.4 Implement `TxtChapterParser.parse()` as async generator.
- [x] 8.5 Commit 6 fixture text files (Moby Dick excerpt, Crime and Punishment excerpt, Dom Casmurro excerpt + 3 more balanced across languages).
- [x] 8.6 Unit tests for cleaner, heuristics loader, and TXT parser against all fixtures.

## Implementation Details

Reference Feature 002 ADR-006 for YAML schema details. For streaming parsing, use Node's `readline.createInterface()` with `crlfDelay: Infinity` on a file-read stream.

### Relevant Files

- Feature 002 ADR-006: [Chapter heuristics YAML](adrs/adr-006.md).
- `packages/ingestion/src/domain/parser/ChapterParser.port.ts` (task_04).
- `packages/ingestion/src/domain/ingestion/IngestionError.ts` (task_04) — `ParseError`, `CleanError`.

### Dependent Files

- `packages/ingestion/src/infrastructure/parsing/chapter-heuristics.yaml` (new)
- `packages/ingestion/src/infrastructure/parsing/chapter-heuristics.ts` (new — loader + schema)
- `packages/ingestion/src/infrastructure/parsing/GutenbergCleaner.ts` (new)
- `packages/ingestion/src/infrastructure/parsing/TxtChapterParser.ts` (new)
- `packages/ingestion/__fixtures__/txt/moby-dick-excerpt.txt` + 5 more (new)
- `packages/ingestion/package.json` (modify: add `yaml`, `js-tiktoken`)
- `packages/ingestion/__tests__/infrastructure/parsing/GutenbergCleaner.test.ts` (new)
- `packages/ingestion/__tests__/infrastructure/parsing/TxtChapterParser.test.ts` (new)
- `packages/ingestion/__tests__/infrastructure/parsing/chapter-heuristics.test.ts` (new)

### Related ADRs

- [ADR-006: Chapter heuristics YAML](adrs/adr-006.md) — this task implements the ADR.
- [ADR-004: Streaming discipline](adrs/adr-004.md) — TxtChapterParser must stream.

## Deliverables

- `chapter-heuristics.yaml` + loader + cleaner + TXT parser implemented.
- 6 fixture text files committed.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_11/16 (full pipeline exercises this module).

## Tests

- Unit tests:
  - [ ] `loadChapterHeuristics()` parses valid YAML; returns config with `en.patterns` as `RegExp[]`.
  - [ ] Missing `en.patterns` in YAML: Zod throws with clear message listing missing fields.
  - [ ] Malformed pattern (e.g., unbalanced paren): loader throws.
  - [ ] `GutenbergCleaner.clean(text)` strips everything before `*** START OF THE PROJECT GUTENBERG EBOOK ... ***`.
  - [ ] `GutenbergCleaner.clean(text)` strips everything after `*** END OF THE PROJECT GUTENBERG EBOOK ... ***`.
  - [ ] `GutenbergCleaner.clean(text)` normalizes 4+ blank lines to 2.
  - [ ] `GutenbergCleaner.clean(text)` on text without START/END markers returns text with trimmed boundaries only (no "missing markers" error).
  - [ ] `TxtChapterParser.parse(mobyDickFixturePath, 'en')` yields 3+ chapters with correct ordinals starting from 1.
  - [ ] `TxtChapterParser.parse(domCasmurroFixturePath, 'pt')` yields 3+ chapters with PT-pattern detection.
  - [ ] `TxtChapterParser.parse(textWithoutChapterMarkers, 'en')` yields single `ParsedChapter` with `title === fallbackTitle`.
  - [ ] Token count in yielded chapters matches `js-tiktoken.encode(plainText).length`.
  - [ ] Streaming: parsing a 1MB fixture does NOT load the whole file into memory at once (memory snapshot mid-iteration stays bounded).
- Integration tests:
  - [ ] Deferred to task_11 / task_16.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- All 6 reference fixture books parse to ≥ 3 chapters each (no "single chapter" outcome on a real book).
- YAML file is editable + PR-reviewable as documentation-friendly data.
