---
status: completed
title: GutendexDownloader (polite fetch + streaming + SHA-256)
type: backend
complexity: medium
dependencies:
  - task_04
---

# Task 6: GutendexDownloader (polite fetch + streaming + SHA-256)

## Overview

Implement the download adapter that fetches raw EPUB or TXT files from the Gutenberg mirror (`aleph.gutenberg.org`) with polite rate limiting, streaming to disk to respect ADR-004, and SHA-256 computation for ADR-003 checkpointing. Serves the download stage handler in task_10.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `packages/ingestion/src/infrastructure/external/GutendexDownloader.ts` with a class `GutendexDownloader` exposing `download(gutendexId: number, format: 'epub' | 'txt'): Promise<{ path: string; sha256: string; bytes: number }>`.
- Default base URL: `https://aleph.gutenberg.org` (configurable via constructor for tests).
- MUST set `User-Agent: dIAlogus/0.1 (+igortullio@gmail.com)` on every request.
- MUST use `bottleneck` with configuration: `{ maxConcurrent: 1, minTime: 1000 }` (at most 1 request per second; additional 0-1s jitter via `Math.random()` sleep before request).
- MUST stream response body directly to `./storage/raw/<gutendex_id>.<ext>` using `stream.pipeline` (or equivalent) — NO full-response buffering in memory.
- MUST compute SHA-256 incrementally during the stream (via `crypto.createHash('sha256').update(chunk)` in a transform stream).
- MUST retry on 5xx with exponential backoff (2 retries max, 500ms base).
- MUST throw `DownloadError` (from task_04) on 4xx without retry, 5xx after retries exhausted, or network error after retries.
- MUST create the `./storage/raw/` directory if missing.
- Add `bottleneck@^2` to `packages/ingestion/package.json` deps.

</requirements>

## Subtasks

- [x] 6.1 Implement class constructor with base URL + User-Agent + bottleneck limiter.
- [x] 6.2 Implement `download(id, format)` with streaming to disk + SHA-256.
- [x] 6.3 Implement retry/backoff logic on 5xx + network errors.
- [x] 6.4 Commit MSW handlers + fixture files for test scenarios (success, 404, 5xx, network error).
- [x] 6.5 Unit tests covering happy path + error paths + SHA-256 correctness.

## Implementation Details

Reference Feature 002 TechSpec § Integration Points (Gutenberg row) + § Technical Considerations → key decision on User-Agent. MSW handlers go in `packages/ingestion/__fixtures__/gutenberg/` and mirror the real endpoint paths (`/cache/epub/<id>/pg<id>.epub.noimages` or similar — exact paths per Gutenberg mirror conventions).

### Relevant Files

- Feature 002 TechSpec § Integration Points + Key Decisions.
- Feature 002 ADR-002 (serial) — rate-limit design rationale.
- Feature 002 ADR-003 (SHA-256 checkpoint).
- `packages/catalog/src/infrastructure/external/GutendexHttpClient.ts` (001-catalog task_08) — pattern reference for adapter + MSW + bottleneck.

### Dependent Files

- `packages/ingestion/src/infrastructure/external/GutendexDownloader.ts` (new)
- `packages/ingestion/__fixtures__/gutenberg/handlers.ts` (new MSW handlers)
- `packages/ingestion/__fixtures__/gutenberg/sample.epub` (tiny fixture EPUB, committed)
- `packages/ingestion/__fixtures__/gutenberg/sample.txt` (tiny fixture text, committed)
- `packages/ingestion/package.json` (modify: add `bottleneck`)
- `packages/ingestion/__tests__/infrastructure/external/GutendexDownloader.test.ts` (new)

### Related ADRs

- [ADR-002: Serial ingestion](adrs/adr-002.md) — download adapter rate-limiting implements serial politeness.
- [ADR-003: Resume via SHA-256](adrs/adr-003.md) — SHA-256 is this task's output for the books.raw_hash column.
- [ADR-004: Streaming discipline](adrs/adr-004.md) — download MUST stream, not buffer.
- [ADR-007: Flat per-stage storage](adrs/adr-007.md) — file path convention.

## Deliverables

- `GutendexDownloader` class with streaming + SHA-256 + rate limit + retries.
- MSW fixtures committed.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_16 (`ingestion-happy.integration.test.ts`).

## Tests

- Unit tests:
  - [x] Happy path: `download(15, 'epub')` returns `{ path, sha256, bytes }` matching fixture.
  - [x] SHA-256 computed correctly (compare against known fixture hash).
  - [x] File is written to `./storage/raw/15.epub`.
  - [x] User-Agent header is `dIAlogus/0.1 (+igortullio@gmail.com)`.
  - [x] Rate limit: two back-to-back `download()` calls are at least 1000ms apart (assert via `Date.now()` diff).
  - [x] 404 response throws `DownloadError` with slug `ingestion-download-failed`, no retry.
  - [x] 503 retries twice with exponential backoff (500ms, 1000ms), then throws `DownloadError` if still 503.
  - [x] Network error (fetch rejects) retries twice, then throws.
  - [x] Streaming path: a large fixture file downloads without process memory spike (measure via `process.memoryUsage()` before/after; diff < 20MB).
  - [x] `./storage/raw/` directory auto-created if missing.
- Integration tests:
  - [ ] Deferred to task_16.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- No test requires real-network access to Gutenberg.
- Streaming verified: downloading a 10MB fixture does not spike memory above a reasonable ceiling.
