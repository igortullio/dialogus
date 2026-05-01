---
status: completed
title: "@dialogus/catalog library use cases (add, list, get, remove, restore)"
type: backend
complexity: medium
dependencies:
  - task_06
---

# Task 10: @dialogus/catalog library use cases (add, list, get, remove, restore)

## Overview

Implement the five library-namespace use cases that operate on local `books` state: `addBookToLibrary`, `listLibrary`, `getBook`, `removeBook`, `restoreBook`. All take injected `BookRepository` and `GutendexClient` ports; no direct Drizzle / Hono imports.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `packages/catalog/src/application/addBookToLibrary.ts` that: looks up by `gutendex_id` via `BookRepository.findByGutendexId`; if existing row found with `deleted_at IS NULL`, throw `DuplicateBookError`; if existing but soft-deleted, throw `DuplicateBookError` whose message points at `POST /:id/restore`; otherwise fetch from `GutendexClient`, map to domain `Book` with `ingestionStatus='discovered'`, and `save` via repository.
- MUST implement `listLibrary({ filter, cursor, limit })` delegating to `BookRepository.list` and returning `{ books, nextCursor }`.
- MUST implement `getBook(id)` delegating to `BookRepository.findById`; throws `BookNotFoundError` if null.
- MUST implement `removeBook(id)` that: calls `BookRepository.findById`; throws `BookNotFoundError` if not found or already soft-deleted; calls `softDelete`.
- MUST implement `restoreBook(id)` that: calls `BookRepository.findById` (including soft-deleted); throws `BookNotFoundError` if not found; calls `restore` and returns the restored entity.
- All use cases MUST remain framework-agnostic (no Hono, no Drizzle imports).
- All five use cases MUST be exported from `@dialogus/catalog` public barrel.

</requirements>

## Subtasks

- [x] 10.1 Implement `addBookToLibrary` with duplicate detection.
- [x] 10.2 Implement `listLibrary` delegating to repository.
- [x] 10.3 Implement `getBook` with not-found handling.
- [x] 10.4 Implement `removeBook` with soft-delete semantics.
- [x] 10.5 Implement `restoreBook` with restore semantics.
- [x] 10.6 Extend public barrel.
- [x] 10.7 Unit tests with in-memory port mocks covering happy + error paths.

## Implementation Details

Reference Feature 001 TechSpec § Implementation Design → use-case signatures. Each use case lives in its own file in `packages/catalog/src/application/` per m5nita's `application/<aggregate>/` convention (one aggregate, many use cases → flat files ok).

### Relevant Files

- `packages/catalog/src/domain/book/BookRepository.port.ts` (task_06).
- `packages/catalog/src/domain/book/GutendexClient.port.ts` (task_06) — used by `addBookToLibrary`.
- `packages/catalog/src/domain/book/BookError.ts` (task_06) — error classes thrown here.

### Dependent Files

- `packages/catalog/src/application/addBookToLibrary.ts` (new)
- `packages/catalog/src/application/listLibrary.ts` (new)
- `packages/catalog/src/application/getBook.ts` (new)
- `packages/catalog/src/application/removeBook.ts` (new)
- `packages/catalog/src/application/restoreBook.ts` (new)
- `packages/catalog/src/index.ts` (modify barrel)
- `packages/catalog/__tests__/application/addBookToLibrary.test.ts` (new)
- `packages/catalog/__tests__/application/listLibrary.test.ts` (new)
- `packages/catalog/__tests__/application/getBook.test.ts` (new)
- `packages/catalog/__tests__/application/removeBook.test.ts` (new)
- `packages/catalog/__tests__/application/restoreBook.test.ts` (new)

## Deliverables

- Five use cases exported from `@dialogus/catalog`.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_14 (`library.integration.test.ts` exercises all 5 via HTTP).

## Tests

- Unit tests:
  - [x] `addBookToLibrary(996)` on an empty repo fetches from Gutendex, maps, saves with `ingestionStatus='discovered'`; returns the saved book.
  - [x] `addBookToLibrary(996)` with existing active book throws `DuplicateBookError` containing the existing `id`.
  - [x] `addBookToLibrary(996)` with existing soft-deleted book throws `DuplicateBookError` whose message mentions `/restore`.
  - [x] `listLibrary({ filter: {}, cursor: undefined })` returns the repository's response unchanged.
  - [x] `getBook('uuid')` returns the book when found; throws `BookNotFoundError` when repo returns null.
  - [x] `removeBook('uuid')` on an existing active book calls `softDelete` once.
  - [x] `removeBook('uuid')` on an already-soft-deleted book throws `BookNotFoundError` (treated as not-present).
  - [x] `restoreBook('uuid')` on a soft-deleted book calls `restore` and returns the restored entity.
  - [x] `restoreBook('uuid')` on a non-existent ID throws `BookNotFoundError`.
- Integration tests:
  - [ ] Deferred to task_14.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Use cases have zero framework imports.
- `@dialogus/catalog` barrel re-exports all 7 use cases from tasks 9 + 10.
