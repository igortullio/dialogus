---
status: completed
title: apps/api /api/catalog/* routes + integration test
type: backend
complexity: medium
dependencies:
    - task_03
    - task_07
    - task_08
    - task_09
    - task_11
---

# Task 13: apps/api /api/catalog/* routes + integration test

## Overview

Wire the two Gutendex-gateway routes (`GET /api/catalog/search` and `GET /api/catalog/books/:gutendex_id`) inside `apps/api/src/infrastructure/http/routes/catalog.ts`. Routes parse incoming queries via Zod schemas from `@dialogus/shared/schemas/catalog`, invoke use cases from task_09, and wrap successful responses in the envelope helper. Ships with an integration test exercising the full path through MSW.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `apps/api/src/infrastructure/http/routes/catalog.ts` exporting `createCatalogRoute(deps: { gutendexClient: GutendexClient }): Hono`.
- MUST register two endpoints:
  - `GET /search` — parse query with `searchRequestSchema` via `@hono/zod-validator`; invoke `searchGutendex` use case; wrap in envelope with `meta.count` + `links.next` derived from the use-case response.
  - `GET /books/:gutendex_id` — parse params (coerce to number); invoke `getGutendexBook`; wrap in envelope `{ data: book }`.
- Cursor for Gutendex search is a passthrough of Gutendex's `next` URL encoded as base64 (Gutendex provides full URL, not a cursor); `decodeCursor` from task_02 is NOT used here — catalog cursors use a different encoding described in this task.
- Errors are thrown and handled by the `problem` middleware from task_11 — no try/catch in the route.
- Route module MUST NOT construct `GutendexClient` — it receives it via deps.
- Integration test `gutendex.integration.test.ts` MUST exercise the route end-to-end: Hono server + MSW-mocked Gutendex; assert envelope shape, error path (Gutendex 503 → 503 Problem Details).

</requirements>

## Subtasks

- [x] 13.1 Implement `createCatalogRoute` factory with `GET /search` + `GET /books/:gutendex_id`.
- [x] 13.2 Add `encodeCatalogCursor` / `decodeCatalogCursor` helpers that wrap the Gutendex `next` URL in base64url.
- [x] 13.3 Unit tests with mocked `GutendexClient`.
- [x] 13.4 Integration test `gutendex.integration.test.ts` with MSW + real Hono server + real repository (`@dialogus/catalog`) injected.

## Implementation Details

Reference Feature 001 TechSpec § API Endpoints (catalog rows) + § Data Flow step "add a book from search". Route factory returns a Hono sub-app mounted at `/api/catalog` by the boot module (task_15).

### Relevant Files

- `packages/shared/src/schemas/catalog.ts` (task_03) — request / response schemas.
- `packages/catalog/src/application/searchGutendex.ts` + `getGutendexBook.ts` (task_09).
- `packages/catalog/src/infrastructure/external/GutendexHttpClient.ts` (task_08).
- `packages/shared/src/http/envelope.ts` (task_01).

### Dependent Files

- `apps/api/src/infrastructure/http/routes/catalog.ts` (new)
- `apps/api/src/infrastructure/http/cursor-catalog.ts` (new small helper)
- `apps/api/__tests__/routes/catalog.test.ts` (new unit test)
- `apps/api/__tests__/integration/gutendex.integration.test.ts` (new integration test)

### Related ADRs

- [ADR-001: Two-namespace API shape (catalog + library)](adrs/adr-001.md) — `/api/catalog/*` namespace.
- [ADR-002: Portfolio-grade 2026 API contract](adrs/adr-002.md) — envelope + cursor conventions.

## Deliverables

- Two endpoints live, envelope-wrapped, Zod-validated.
- Unit + integration tests **(REQUIRED)**.
- 80 %+ coverage on the route module.

## Tests

- Unit tests:
  - [x] `GET /search?q=Moby+Dick&language=en` with mocked client → envelope `{ data: Book[], meta: { count: N }, links: { next?, self } }`.
  - [x] `GET /search?language=xx` (invalid language) → 400 Problem Details `validation-failed`.
  - [x] `GET /books/996` with mocked client returning a book → envelope `{ data: Book }`.
  - [x] `GET /books/abc` (non-numeric) → 400 Problem Details `validation-failed`.
  - [x] Mocked client throws `GutendexUpstreamError(503, 'timeout')` → 503 Problem Details.
- Integration tests (`gutendex.integration.test.ts`):
  - [x] Full path: Hono server + real `GutendexHttpClient` + MSW handlers; `GET /api/catalog/search?q=Don+Quixote&language=en` returns 200 envelope with ≥ 1 result.
  - [x] MSW simulates 5xx → route returns 503 Problem Details.
  - [x] MSW simulates validation-failure response → route returns 503 Problem Details `gutendex-validation-failed`.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Route factory is dependency-injected — unit tests pass without network access.
- Integration test demonstrates the full vertical slice for catalog endpoints.
