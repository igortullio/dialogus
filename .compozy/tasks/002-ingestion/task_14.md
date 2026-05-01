---
status: completed
title: apps/api library routes (ingest/ingestion/retry/chunks)
type: backend
complexity: medium
dependencies:
  - task_01
  - task_03
  - task_05
---

# Task 14: apps/api library routes (ingest/ingestion/retry/chunks)

## Overview

Extend `apps/api/src/infrastructure/http/routes/library.ts` with the four ingestion-related endpoints: `POST /ingest` (enqueue), `GET /ingestion` (status), `POST /ingest/retry` (resume), `GET /chunks/:id` (excerpt). Routes validate requests via schemas from task_01, enforce status-transition guards, apply idempotency middleware, and delegate to the transient-enqueue helper from task_02 for pg-boss.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST extend `apps/api/src/infrastructure/http/routes/library.ts` with 4 new handlers:
  - `POST /api/library/books/:id/ingest` — guard: book must be in `discovered` state else 409 `book-not-in-discovered-state`; applies `idempotency` middleware (from Feature 001 task_12); enqueues `ingestion.download` via the `enqueue` helper (from task_02); returns 202 envelope with `{ book_id, status: 'downloading', stage: 'download', job_id }`.
  - `GET /api/library/books/:id/ingestion` — reads `books` row; composes `IngestionStatusDto` per schema from task_01; returns 200 envelope; 404 if book not found.
  - `POST /api/library/books/:id/ingest/retry` — guards: book must be in `failed` state else 409 `book-not-in-retryable-state`; if `ready` → 409 `book-already-ready`; reads `books.ingestion_last_stage`, enqueues `ingestion.<last_stage>`; applies `idempotency` middleware; returns 202.
  - `GET /api/library/chunks/:id` — reads chunk via `ChunkRepository.findById`; returns 200 envelope with `ChunkReadDto` (id, book_id, chapter_id, chapter_ordinal, chapter_title, text, start_char, end_char); 404 `chunk-not-found` if not present.
- All routes MUST use the `problem` middleware (catches errors, converts to RFC 9457 JSON).
- `GET /chunks/:id` requires both `chunkRepo` (task_05) and a join with `chapters` to populate `chapter_title` + `chapter_ordinal` — acceptable to use a dedicated `chunkRepo.findByIdWithChapter` method (add if not present in task_05, or use a join query here).
- Zod validation of path params + query + body via `@hono/zod-validator` as established in Feature 001.

</requirements>

## Subtasks

- [x] 14.1 Implement `POST /ingest` with guard + idempotency + enqueue.
- [x] 14.2 Implement `GET /ingestion` with state composition.
- [x] 14.3 Implement `POST /ingest/retry` with state-guard + resume enqueue.
- [x] 14.4 Implement `GET /chunks/:id` with chapter join.
- [x] 14.5 Unit tests for each route with mocked deps.

## Implementation Details

Reference Feature 002 TechSpec § API Endpoints for each endpoint's exact response shape and § Data Flow step 3 for enqueue semantics. The transient enqueue helper from task_02 is the only way routes interact with pg-boss (apps/api does not run a long-lived pg-boss instance, per ADR-005).

### Relevant Files

- `packages/shared/src/schemas/ingestion.ts` (task_01).
- `apps/api/src/infrastructure/pgboss/enqueue.ts` (task_02).
- `apps/api/src/infrastructure/http/middleware/idempotency.ts` + `problem.ts` (from Feature 001).
- `apps/api/src/infrastructure/http/routes/library.ts` (from Feature 001 task_14) — extend this existing file.
- `packages/catalog/src/domain/book/BookRepository.port.ts` + `packages/ingestion/src/domain/chunk/ChunkRepository.port.ts`.

### Dependent Files

- `apps/api/src/infrastructure/http/routes/library.ts` (modify: add 4 routes)
- `apps/api/src/application/library/ingest.ts` (new — HTTP-layer glue wrapping enqueue + guards)
- `apps/api/src/application/library/getIngestionStatus.ts` (new)
- `apps/api/src/application/library/retryIngest.ts` (new)
- `apps/api/src/application/library/getChunk.ts` (new)
- `apps/api/__tests__/routes/library-ingestion.test.ts` (new)

### Related ADRs

- [ADR-002: Portfolio-grade API](../../001-catalog/adrs/adr-002.md) (catalog) — envelope + Problem Details conventions.
- [ADR-005: apps/worker sole worker](adrs/adr-005.md) — routes use transient enqueue only.

## Deliverables

- 4 new endpoints live with guards + idempotency + envelope responses.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_16 (`ingestion-happy.integration.test.ts`, `ingestion-retry.integration.test.ts`, `chunks-read.integration.test.ts`).

## Tests

- Unit tests:
  - [x] `POST /ingest` on a `discovered` book returns 202 with `{ status: 'downloading', job_id }`; mocked `enqueue('ingestion.download', ...)` called once.
  - [x] `POST /ingest` on a `downloading` book returns 409 `book-not-in-discovered-state`.
  - [x] `POST /ingest` on a `ready` book returns 409 `book-not-in-discovered-state`.
  - [x] `POST /ingest` with `Idempotency-Key` replay returns the cached 202 response.
  - [x] `GET /ingestion` on a book returns envelope matching `IngestionStatusDto`; includes stage, progress, error if failed.
  - [x] `GET /ingestion` on unknown book returns 404.
  - [x] `POST /ingest/retry` on a `failed` book enqueues `ingestion.<last_stage>` based on `books.ingestion_last_stage`.
  - [x] `POST /ingest/retry` on `ready` returns 409 `book-already-ready`.
  - [x] `POST /ingest/retry` on `discovered` returns 409 `book-not-in-retryable-state`.
  - [x] `GET /chunks/:id` returns envelope with chapter_title + chapter_ordinal joined in.
  - [x] `GET /chunks/:id` on unknown id returns 404 `chunk-not-found`.
- Integration tests:
  - [ ] Deferred to task_16.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Every guard branch returns correct Problem Details with matching slug + status code.
- Idempotency replays work identically to catalog's `POST /books` (Feature 001 task_12).
