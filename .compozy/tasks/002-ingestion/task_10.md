---
status: completed
title: Download + Clean stage handlers
type: backend
complexity: medium
dependencies:
  - task_05
  - task_06
  - task_08
---

# Task 10: Download + Clean stage handlers

## Overview

Implement the first two stage handlers of the ingestion pipeline: `ingestion.download` (stage 1) and `ingestion.clean` (stage 2). Each is a pg-boss handler function that reads book state from DB, performs its work via injected adapters, updates `books.ingestion_status` + `ingestion_progress`, and enqueues the next stage's queue via injected `PgBoss` instance.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `packages/ingestion/src/application/stages/download.ts` as a function `downloadStage(payload: StagePayload, deps: StageDeps): Promise<void>`:
  - Read `books` row by `bookId`; update `ingestion_status='downloading'`, `ingestion_progress=0`, `ingestion_last_stage='download'`, `ingestion_started_at=COALESCE(ingestion_started_at, now())`.
  - Check if `./storage/raw/<gutendex_id>.<ext>` exists AND `books.raw_hash` matches computed SHA-256 → skip to enqueue-next.
  - Otherwise call `deps.downloader.download(gutendex_id, preferredFormat)` (prefer EPUB; fallback TXT if EPUB URL absent); update `books.raw_hash` with returned SHA-256.
  - On success, `deps.pgboss.send('ingestion.clean', { bookId })`.
  - On failure, set `ingestion_status='failed'`, `ingestion_error=<slug + message>`, rethrow (pg-boss marks job failed).
- MUST implement `packages/ingestion/src/application/stages/clean.ts` similarly:
  - Read book; update `ingestion_status='cleaning'`, `ingestion_progress=0`, `ingestion_last_stage='clean'`.
  - Check if `./storage/clean/<gutendex_id>.txt` exists → skip to enqueue-next.
  - Otherwise: read `./storage/raw/<gutendex_id>.<ext>` (stream), call `GutenbergCleaner.clean()`, write to `./storage/clean/<gutendex_id>.txt` (stream).
  - Update `ingestion_progress=100` at end of stage.
  - Enqueue `ingestion.parse`.
- Both handlers MUST emit pino structured logs per TechSpec § Monitoring ("Structured logs per stage").
- Both MUST throw ingestion errors (from task_04) on failure — never swallow.
- Progress updates SHOULD happen at natural checkpoints (e.g., 0% start, 100% end). Download stage may also update at 25/50/75% based on Content-Length progress if available; acceptable to just emit 0 → 100 for V1.

</requirements>

## Subtasks

- [x] 10.1 Implement `downloadStage` with SHA-256 idempotency check.
- [x] 10.2 Implement `cleanStage` with file-exists idempotency check.
- [x] 10.3 Wire pino structured logging to each stage.
- [x] 10.4 Unit tests with in-memory port mocks + mocked PgBoss.
- [x] 10.5 Verify upstream "already done?" checks behave correctly for resume (ADR-003).

## Implementation Details

Reference Feature 002 TechSpec § Data Flow (happy-path steps 4-5) and § Build Order step 8. Stage handlers are framework-agnostic functions; they don't import Hono or `apps/api`.

### Relevant Files

- `packages/ingestion/src/domain/parser/ChapterParser.port.ts` + `infrastructure/external/GutendexDownloader.ts` (task_06) + `infrastructure/parsing/GutenbergCleaner.ts` (task_08).
- `packages/ingestion/src/infrastructure/persistence/DrizzleChapterRepository.ts` (task_05) — for books row reads if we add a helper.
- Feature 002 TechSpec § Core Interfaces (StagePayload + StageDeps shapes).

### Dependent Files

- `packages/ingestion/src/application/stages/download.ts` (new)
- `packages/ingestion/src/application/stages/clean.ts` (new)
- `packages/ingestion/src/application/stages/_common.ts` (new small helper for "update books row" pattern reused across all 6 stages — may already exist; create here if not)
- `packages/ingestion/__tests__/application/stages/download.test.ts` (new)
- `packages/ingestion/__tests__/application/stages/clean.test.ts` (new)

### Related ADRs

- [ADR-001: Chained pg-boss jobs](adrs/adr-001.md) — handler enqueues next stage.
- [ADR-003: Resume via SHA-256](adrs/adr-003.md) — download handler's upstream-check.
- [ADR-004: Streaming](adrs/adr-004.md) — clean reads/writes stream.

## Deliverables

- Two stage handlers implemented.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_16 (`ingestion-happy.integration.test.ts`).

## Tests

- Unit tests:
  - [ ] `downloadStage` on a fresh book: calls `downloader.download`, writes SHA-256 to books row, enqueues `ingestion.clean`.
  - [ ] `downloadStage` on a book with existing matching raw file + `raw_hash`: does NOT call `downloader.download` (mock call count = 0); still enqueues `ingestion.clean`.
  - [ ] `downloadStage` on a book with existing raw file but mismatched hash: calls `downloader.download` (hash mismatch forces re-download).
  - [ ] `downloadStage` mocked `downloader` throwing 503: handler sets `ingestion_status='failed'`, throws — pg-boss is responsible for the retry bookkeeping, not the handler.
  - [ ] `cleanStage` on a fresh book: reads `./storage/raw/...`, writes `./storage/clean/...`, enqueues `ingestion.parse`.
  - [ ] `cleanStage` on a book with existing cleaned file: does NOT re-read raw (mock fs call count = 0); still enqueues.
  - [ ] Both handlers emit pino log line with `{ stage, book_id, duration_ms }`.
- Integration tests:
  - [ ] Deferred to task_16.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Handlers are pure functions over injected deps — zero filesystem or network I/O done directly in the handler's own module (all via injected adapters except the clean stage's local file I/O, which is bounded by storage paths).
- Resume semantics work: running the handler twice with same book_id yields the same end state.
