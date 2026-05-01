---
status: completed
title: Add @dialogus/shared/schemas book/catalog/library DTOs
type: backend
complexity: low
dependencies: []
---

# Task 3: Add @dialogus/shared/schemas book/catalog/library DTOs

## Overview

Define the Zod schemas and derived TypeScript types that serve as the over-the-wire contract between `apps/api` and any client (future `apps/web` server components, future SDKs). Three new schema files: `book.ts` (shared Book + Gutendex DTOs), `catalog.ts` (search request/response), `library.ts` (CRUD request/response including cursor query).

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/shared/src/schemas/book.ts` with `bookDtoSchema` (matches the `Book` entity over the wire: camelCase fields, ISO-8601 dates, omits `rawHash`) and `gutendexBookSchema` (raw Gutendex response shape, used by the Gutendex client validator in task_08).
- MUST create `packages/shared/src/schemas/catalog.ts` with `searchRequestSchema` (query params: `q?`, `language? in ['en','pt']`, `topic?`, `sort? in ['popular','ascending','descending']`, `cursor?`, `limit? 1-32 default 32`) and `searchResponseSchema` (envelope shape with `data: bookDtoSchema.array()` + `meta.count` + `links.next?`).
- MUST create `packages/shared/src/schemas/library.ts` with: `addBookRequestSchema` (`{ gutendex_id: number }`), `listLibraryQuerySchema` (cursor + limit + status + language + include_deleted), `bookResponseSchema` (envelope with single `bookDtoSchema`), `listLibraryResponseSchema` (envelope with `bookDtoSchema.array()` + meta + links).
- `IngestionStatus` enum MUST match product TechSpec: `discovered | downloading | parsing | chunking | embedding | ready | failed`.
- All schemas MUST be `.strip()` by default (tolerant to unknown fields from upstream Gutendex per ADR-004 Known Risks).
- Extend `@dialogus/shared/package.json` exports map with `./schemas/book`, `./schemas/catalog`, `./schemas/library`.

</requirements>

## Subtasks

- [x] 3.1 Implement `bookDtoSchema` + `gutendexBookSchema` + inferred types.
- [x] 3.2 Implement `searchRequestSchema` + `searchResponseSchema` in `catalog.ts`.
- [x] 3.3 Implement `addBookRequestSchema`, `listLibraryQuerySchema`, `bookResponseSchema`, `listLibraryResponseSchema` in `library.ts`.
- [x] 3.4 Extend `exports` map + barrel re-exports.
- [x] 3.5 Write round-trip validation tests for each schema.

## Implementation Details

Reference Feature 001 TechSpec § Implementation Design → Data Models for fields and § API Endpoints for request/response shapes. Use `z.coerce.number()` for `gutendex_id` and `limit` to handle query-string coercion.

### Relevant Files

- Feature 001 TechSpec § Data Models and § API Endpoints.
- Product TechSpec § Data Models (source of `IngestionStatus` enum).
- `packages/shared/src/schemas/health.ts` (from Foundation task_07) — pattern reference.

### Dependent Files

- `packages/shared/src/schemas/book.ts` (new)
- `packages/shared/src/schemas/catalog.ts` (new)
- `packages/shared/src/schemas/library.ts` (new)
- `packages/shared/src/schemas/index.ts` (modify barrel)
- `packages/shared/package.json` (modify exports)
- `packages/shared/__tests__/schemas/book.test.ts` (new)
- `packages/shared/__tests__/schemas/catalog.test.ts` (new)
- `packages/shared/__tests__/schemas/library.test.ts` (new)

### Related ADRs

- [ADR-002: Portfolio-grade 2026 API contract](adrs/adr-002.md) — envelope shape these schemas enforce.
- [ADR-004: In-memory LRU cache for Gutendex](adrs/adr-004.md) — `.strip()` default aligns with tolerant Gutendex validation.

## Deliverables

- 3 new schema files with derived TypeScript types exported.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_13 / task_14 where schemas validate real requests and responses.

## Tests

- Unit tests:
  - [x] `bookDtoSchema.parse(validBookObject)` succeeds; output excludes `raw_hash` (covered by "strips raw_hash" case).
  - [x] `gutendexBookSchema.parse(gutendexResponseFixture)` succeeds with all PG fields.
  - [x] `gutendexBookSchema.parse({ id: 1, title: 'X' })` fails — missing required fields.
  - [x] `searchRequestSchema.parse({ language: 'en', limit: '10' })` coerces `limit` to number 10.
  - [x] `searchRequestSchema.parse({ language: 'de' })` fails — `de` not in enum.
  - [x] `listLibraryQuerySchema` accepts `include_deleted: 'true'` and coerces to boolean.
  - [x] `addBookRequestSchema.parse({ gutendex_id: '996' })` coerces to number.
  - [x] `bookResponseSchema.parse({ data: validBookDto })` succeeds.
- Integration tests:
  - [ ] Deferred to task_13 / task_14.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Every route handler in task_13 and task_14 can use `@hono/zod-validator` with these schemas directly.
- Type inference produces the same `Book`, `BookDto`, `GutendexBook` types that `@dialogus/catalog` domain can consume.
