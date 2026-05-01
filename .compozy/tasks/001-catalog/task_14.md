---
status: completed
title: apps/api /api/library/* routes + integration tests
type: backend
complexity: high
dependencies:
    - task_03
    - task_07
    - task_10
    - task_11
    - task_12
---

# Task 14: apps/api /api/library/* routes + integration tests

## Overview

Wire the five library CRUD routes (POST add, GET list, GET :id, DELETE, POST /:id/restore) in `apps/api/src/infrastructure/http/routes/library.ts`. Applies the idempotency middleware to `POST /api/library/books` per ADR-003. Integration tests cover the full library flow plus the cursor pagination flow against Testcontainers Postgres.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `apps/api/src/infrastructure/http/routes/library.ts` exporting `createLibraryRoute(deps: { bookRepository, addBookToLibrary, listLibrary, getBook, removeBook, restoreBook, db })`.
- MUST register five endpoints exactly matching Feature 001 TechSpec § API Endpoints (library rows):
  - `POST /books` with `idempotency({ db })` middleware applied; validates body via `addBookRequestSchema`; returns 201 envelope.
  - `GET /books` validates query via `listLibraryQuerySchema`; returns 200 envelope with cursor next link built via `encodeCursor` from task_02.
  - `GET /books/:id` returns 200 envelope or throws `BookNotFoundError` → 404.
  - `DELETE /books/:id` returns 204 no body.
  - `POST /books/:id/restore` returns 200 envelope with restored book.
- Route MUST NOT instantiate the middleware or use cases — they are injected via `deps`.
- MUST surface use-case errors naturally so `problem` middleware converts them.
- Integration tests (three files):
  - `library.integration.test.ts` — full sequence: POST → GET list → GET :id → DELETE → GET list excludes → GET :id shows `deleted_at` → POST /restore → GET list includes.
  - `cursor.integration.test.ts` — insert 50 books with staggered `created_at`; paginate via 3 cursor pages (limit=20); assert no duplicates, no gaps, deterministic order.
  - (`idempotency.integration.test.ts` is owned by task_12; `gutendex.integration.test.ts` by task_13.)

</requirements>

## Subtasks

- [x] 14.1 Implement `createLibraryRoute` factory with all 5 routes.
- [x] 14.2 Apply `idempotency` middleware only to `POST /books`.
- [x] 14.3 Build `links.next` on GET list using `encodeCursor` on the last returned book's `{createdAt, id}`.
- [x] 14.4 Unit tests with mocked use cases.
- [x] 14.5 Integration test `library.integration.test.ts` (full sequence).
- [x] 14.6 Integration test `cursor.integration.test.ts` (50 books, 3 pages).

## Implementation Details

Reference Feature 001 TechSpec § Data Flow for the full ingestion of an "add book" request + § API Endpoints for response shapes. Cursor links are built inside the route after receiving `{ books, nextCursor }` from `listLibrary`.

### Relevant Files

- `packages/shared/src/schemas/library.ts` (task_03).
- `packages/catalog/src/application/*.ts` (task_10) — five use cases injected.
- `apps/api/src/infrastructure/http/middleware/idempotency.ts` (task_12).
- `apps/api/src/infrastructure/http/middleware/problem.ts` (task_11).
- `packages/shared/src/http/{envelope,cursor}.ts` (tasks 01, 02).

### Dependent Files

- `apps/api/src/infrastructure/http/routes/library.ts` (new)
- `apps/api/__tests__/routes/library.test.ts` (new unit test)
- `apps/api/__tests__/integration/library.integration.test.ts` (new)
- `apps/api/__tests__/integration/cursor.integration.test.ts` (new)

### Related ADRs

- [ADR-001: Two-namespace API shape](adrs/adr-001.md) — library namespace.
- [ADR-002: Portfolio-grade 2026 API contract](adrs/adr-002.md) — envelope, Idempotency-Key, soft-delete/restore.
- [ADR-003: Idempotency-Key stored in dedicated table](adrs/adr-003.md) — middleware applied on POST.
- [ADR-005: Tuple cursor](adrs/adr-005.md) — cursor link construction.

## Deliverables

- Five routes live, envelope-wrapped, Zod-validated, problem-middleware-covered.
- `idempotency` middleware opt-in on POST `/books`.
- Unit + 2 integration tests **(REQUIRED)**.
- 80 %+ coverage on the route module.

## Tests

- Unit tests:
  - [x] `POST /books` with valid body + mocked use case → 201 envelope `{ data: book }`.
  - [x] `POST /books` with invalid body → 400 Problem Details `validation-failed`.
  - [x] `POST /books` with `Idempotency-Key` header + mocked idempotency middleware returning cached response → 201 replay response passes through.
  - [x] `GET /books` returns envelope; mocks use case to return 3 books; `links.next` present when `nextCursor` non-null.
  - [x] `GET /books?cursor=<bad>` → 400 Problem Details `invalid-cursor`.
  - [x] `GET /books/:id` with mocked use case throwing `BookNotFoundError` → 404 Problem Details.
  - [x] `DELETE /books/:id` → 204 no body; mocked `removeBook` called once.
  - [x] `POST /books/:id/restore` → 200 envelope; mocked `restoreBook` called once.
- Integration tests (`library.integration.test.ts`):
  - [x] Full sequence: POST → GET list (1 item) → GET :id (200) → DELETE (204) → GET list (0 active) → GET list?include_deleted=true (1 with deleted_at) → POST /restore (200) → GET list (1 active again).
  - [x] POST duplicate `gutendex_id` without Idempotency-Key → 409 Problem Details `duplicate-gutendex-id` with existing_book_id extension.
  - [x] GET list filtered by `status=discovered` returns only matching books.
- Integration tests (`cursor.integration.test.ts`):
  - [x] Insert 50 books via repository direct; paginate GET list with limit=20 → 3 pages → merge all results → 50 unique books in descending created_at order.
  - [x] Mid-pagination insert: start page 1, insert a new book, request page 2 via cursor — new book does NOT appear (cursor snapshot stable).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Route registers cleanly in the boot module (task_15) without circular deps.
- Two integration suites run under 30 s wall-clock each against Testcontainers.
