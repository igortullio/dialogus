---
status: completed
title: "@dialogus/catalog catalog use cases (search + detail)"
type: backend
complexity: low
dependencies:
  - task_06
---

# Task 9: @dialogus/catalog catalog use cases (search + detail)

## Overview

Implement the two catalog-namespace use cases: `searchGutendex(query)` and `getGutendexBook(gutendexId)`. Both are thin orchestrators that delegate to an injected `GutendexClient` port. No persistence, no side effects beyond the client's own caching.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `packages/catalog/src/application/searchGutendex.ts` that accepts `{ client: GutendexClient }` deps + query + pagination and returns `{ books: Book[], nextPage: string | null, count: number }`.
- MUST implement `packages/catalog/src/application/getGutendexBook.ts` that accepts `{ client: GutendexClient }` + gutendexId and returns `Book`.
- Both use cases MUST map from the Gutendex DTO to the internal `Book` shape (id absent — remote books have no local id yet).
- Both use cases MUST be pure orchestrators — no Drizzle, no HTTP framework, no Hono.
- MUST export from `@dialogus/catalog` public barrel (`src/index.ts`) — use cases are the public API.

</requirements>

## Subtasks

- [x] 9.1 Implement `searchGutendex` delegating to `client.search`.
- [x] 9.2 Implement `getGutendexBook` delegating to `client.getBook`.
- [x] 9.3 Implement a tiny `toBookFromGutendex(dto)` helper used by both.
- [x] 9.4 Extend barrel with these exports.
- [x] 9.5 Unit tests with a mocked `GutendexClient`.

## Implementation Details

Reference Feature 001 TechSpec § Core Interfaces for use-case signatures. Use cases live at `packages/catalog/src/application/` — one file per use case, following m5nita's `application/<aggregate>/` convention.

### Relevant Files

- `packages/catalog/src/domain/book/GutendexClient.port.ts` (task_06).
- `packages/catalog/src/domain/book/Book.ts` (task_06).
- Feature 001 TechSpec § Implementation Design.

### Dependent Files

- `packages/catalog/src/application/searchGutendex.ts` (new)
- `packages/catalog/src/application/getGutendexBook.ts` (new)
- `packages/catalog/src/application/mappers/toBookFromGutendex.ts` (new helper)
- `packages/catalog/src/index.ts` (modify barrel)
- `packages/catalog/__tests__/application/searchGutendex.test.ts` (new)
- `packages/catalog/__tests__/application/getGutendexBook.test.ts` (new)

## Deliverables

- Two use cases exported from `@dialogus/catalog`.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_13 (`gutendex.integration.test.ts`).

## Tests

- Unit tests:
  - [x] `searchGutendex({ q: 'Moby Dick' })` with mocked client returns books + `nextPage` from the mocked response.
  - [x] `searchGutendex({ q: 'x', limit: 10 })` passes `limit` through to the client.
  - [x] `getGutendexBook(15)` returns a `Book` with `ingestionStatus` left out/undefined (remote books have no local state).
  - [x] Use cases do not catch `GutendexUpstreamError` — they let it propagate for the route handler + problem middleware.
- Integration tests:
  - [ ] Deferred to task_13.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Use cases compile with no Hono or Drizzle imports.
- Public barrel exposes both use cases.
