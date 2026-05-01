---
status: completed
title: "@dialogus/catalog GutendexHttpClient + MSW fixtures"
type: backend
complexity: medium
dependencies:
    - task_06
---

# Task 8: @dialogus/catalog GutendexHttpClient + MSW fixtures

## Overview

Implement the `GutendexClient` port adapter using Node `fetch` + `lru-cache@11` for the 60-second cache per ADR-004, with Zod `.strip()` validation for tolerant handling of Gutendex response drift. Ships with committed MSW fixtures so every downstream test can exercise the client without network I/O.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `packages/catalog/src/infrastructure/external/GutendexHttpClient.ts` satisfying `GutendexClient` port from task_06.
- Base URL default `https://gutendex.com`; overridable via constructor for tests.
- MUST use `lru-cache@^11` with `{ max: 500, ttl: 60_000 }` per ADR-004.
- Cache key MUST be `GET ${path}?${sortedQueryString}` — params sorted alphabetically to prevent key collisions.
- Response validation MUST use the `gutendexBookSchema` from `@dialogus/shared/schemas/book` via `.strip()` mode (tolerant to unknown fields).
- On `fetch` network error or 5xx: MUST retry with exponential backoff (2× total attempts, base 500 ms).
- On final failure: MUST throw `GutendexUpstreamError` carrying upstream status + body.
- On 4xx: MUST throw `GutendexUpstreamError` without retry (upstream says "don't ask again").
- MUST commit MSW handlers + fixtures under `packages/catalog/__fixtures__/gutendex/` — at minimum: `search-don-quixote.json`, `book-996.json`, `search-machado.json`, `5xx.json`, `validation-failure.json`.
- Add `lru-cache@^11` as dependency to `packages/catalog/package.json`.
- Add `msw@^2` as devDependency.

</requirements>

## Subtasks

- [x] 8.1 Implement `GutendexHttpClient` constructor with base URL + cache + validator.
- [x] 8.2 Implement `search(query)` method with cache lookup + store.
- [x] 8.3 Implement `getBook(id)` method with cache lookup + store.
- [x] 8.4 Implement retry/backoff on 5xx + network errors.
- [x] 8.5 Commit MSW handlers + 5 fixture files.
- [x] 8.6 Unit tests covering cache hit, cache miss, validation, retry, fail paths.

## Implementation Details

Reference Feature 001 TechSpec § Implementation Design + ADR-004. Use `fetch` (built-in Node 22). Cache lives inside the client instance (per-request to routes is fine, but per-process for reuse).

### Relevant Files

- `packages/catalog/src/domain/book/GutendexClient.port.ts` (task_06) — interface to satisfy.
- `packages/shared/src/schemas/book.ts` (task_03) — `gutendexBookSchema` validator.
- Feature 001 ADR-004: [In-memory LRU cache for Gutendex](adrs/adr-004.md).

### Dependent Files

- `packages/catalog/src/infrastructure/external/GutendexHttpClient.ts` (new)
- `packages/catalog/__fixtures__/gutendex/handlers.ts` (new MSW handlers)
- `packages/catalog/__fixtures__/gutendex/search-don-quixote.json` (new fixture)
- `packages/catalog/__fixtures__/gutendex/book-996.json` (new fixture)
- `packages/catalog/__fixtures__/gutendex/search-machado.json` (new fixture)
- `packages/catalog/__fixtures__/gutendex/5xx.json` (new fixture)
- `packages/catalog/__fixtures__/gutendex/validation-failure.json` (new fixture)
- `packages/catalog/package.json` (modify: add `lru-cache`, `msw`)
- `packages/catalog/__tests__/infrastructure/external/GutendexHttpClient.test.ts` (new)

### Related ADRs

- [ADR-004: In-memory LRU cache for Gutendex responses](adrs/adr-004.md).

## Deliverables

- `GutendexHttpClient` implemented with cache + retry + validation.
- Committed MSW fixtures covering happy + failure paths.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — task_13 `gutendex.integration.test.ts` exercises it through real routes.

## Tests

- Unit tests:
  - [x] Cache miss: first `search({ q: 'Don Quixote' })` hits MSW handler; response matches fixture shape.
  - [x] Cache hit: second identical call returns from cache without MSW re-invocation (assert network call count).
  - [x] Cache key differs when `q` differs; differs when `languages` order differs only after alphabetical sort (i.e., identical content with reordered params hits the same cache entry).
  - [x] TTL: cache entry evicted after configured TTL elapses (verified with `cacheTtlMs: 25` + real timers — fake timers conflict with MSW interceptor; lru-cache 11 has no clock injection point).
  - [x] Zod `.strip()`: response with extra `unknown_field` parses without error.
  - [x] Missing required field (e.g., no `title`): throws typed `GutendexValidationError` (code `GUTENDEX_VALIDATION_FAILED`) convertible to `gutendex-validation-failed` Problem Details.
  - [x] 5xx response: retries once after 500 ms, then throws `GutendexUpstreamError`.
  - [x] 404 response: throws `GutendexUpstreamError` without retry.
  - [x] Network error (fetch throws): retries once, then throws `GutendexUpstreamError`.
  - [x] `getBook(996)` hits the correct URL path `/books/996`.
- Integration tests:
  - [ ] Deferred to task_13 (`gutendex.integration.test.ts` with MSW + real Hono server).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- MSW fixtures can be reused by any future test in features 002-004 that needs Gutendex mocking.
- Cache behavior is deterministic and time-bounded by TTL.
