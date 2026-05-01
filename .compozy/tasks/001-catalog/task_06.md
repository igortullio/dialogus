---
status: completed
title: "@dialogus/catalog scaffold + domain layer"
type: backend
complexity: medium
dependencies:
  - task_03
---

# Task 6: @dialogus/catalog scaffold + domain layer

## Overview

Create the first domain-owning workspace package (`@dialogus/catalog`) with hexagonal layout inside the package: `domain/`, `application/`, `infrastructure/`. This task writes the domain layer only — `Book` entity, `BookRepository` port, `GutendexClient` port, and domain errors — leaving application + infrastructure layers for subsequent tasks. Establishes the DDD pattern that Features 002-004 mirror.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/catalog/package.json` with `"name": "@dialogus/catalog"`, `"type": "module"`, `"private": true`, deps on `zod`, `@dialogus/shared@workspace:*`, and — at this layer — no Drizzle, no HTTP client (those come in task_07 and task_08).
- MUST create `packages/catalog/tsconfig.json` extending root.
- MUST create the hexagonal folders: `src/domain/book/`, `src/application/`, `src/infrastructure/persistence/`, `src/infrastructure/persistence/mappers/`, `src/infrastructure/external/`.
- MUST implement `src/domain/book/Book.ts` per Feature 001 TechSpec § Core Interfaces (Book entity).
- MUST implement `src/domain/book/BookRepository.port.ts` (interface exactly per TechSpec).
- MUST implement `src/domain/book/GutendexClient.port.ts` (interface exactly per TechSpec).
- MUST implement `src/domain/book/BookError.ts` with `DuplicateBookError`, `BookNotFoundError`, `GutendexUpstreamError`, all extending `DialogusError` from `@dialogus/shared/errors` with appropriate `code` values (`DUPLICATE_GUTENDEX_ID`, `BOOK_NOT_FOUND`, `GUTENDEX_UPSTREAM_ERROR`).
- Public barrel `src/index.ts` MUST only export domain entities, ports, errors, and types — NOT adapters or concrete implementations.
- MUST add `typecheck` + `test` scripts.

</requirements>

## Subtasks

- [x] 6.1 Scaffold `packages/catalog/package.json`, `tsconfig.json`.
- [x] 6.2 Create hexagonal folders.
- [x] 6.3 Implement `Book` entity with readonly fields.
- [x] 6.4 Implement `BookRepository.port.ts` + `GutendexClient.port.ts`.
- [x] 6.5 Implement `BookError.ts` hierarchy.
- [x] 6.6 Barrel re-exports from `src/index.ts`.
- [x] 6.7 Unit tests for error class behavior.

## Implementation Details

Reference Feature 001 TechSpec § Core Interfaces for exact signatures. m5nita's `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/domain/pool/` (Pool.ts, PoolError.ts, PoolRepository.port.ts) is the closest template — adapt to package-internal layout.

### Relevant Files

- Feature 001 TechSpec § Core Interfaces.
- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/domain/pool/Pool.ts` — entity pattern reference.
- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/domain/pool/PoolRepository.port.ts` — port pattern reference.
- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/domain/pool/PoolError.ts` — error hierarchy pattern reference.

### Dependent Files

- `packages/catalog/package.json` (new)
- `packages/catalog/tsconfig.json` (new)
- `packages/catalog/src/index.ts` (new barrel)
- `packages/catalog/src/domain/book/Book.ts` (new)
- `packages/catalog/src/domain/book/BookRepository.port.ts` (new)
- `packages/catalog/src/domain/book/GutendexClient.port.ts` (new)
- `packages/catalog/src/domain/book/BookError.ts` (new)
- `packages/catalog/__tests__/domain/book/BookError.test.ts` (new)

### Related ADRs

- [ADR-004: Infrastructure-first layout for apps/api](../../000-foundation/adrs/adr-004.md) (Foundation) — contrast: catalog uses full hexagonal inside the package, not just infrastructure-first.

## Deliverables

- `@dialogus/catalog` scaffolded with domain-only code.
- `Book` + ports + error hierarchy exported via public barrel.
- Unit tests with 80%+ coverage **(REQUIRED)** — error hierarchy tests + type-level barrel tests.
- Integration tests **(REQUIRED)** — deferred to task_13 / task_14 where the domain types flow through real HTTP.

## Tests

- Unit tests:
  - [x] `new DuplicateBookError('gutendex 996 exists as uuid X')` → `err.code === 'DUPLICATE_GUTENDEX_ID'` and `err instanceof DialogusError`.
  - [x] `new BookNotFoundError('uuid X')` → `err.code === 'BOOK_NOT_FOUND'`.
  - [x] `new GutendexUpstreamError(503, 'timeout')` → `err.code === 'GUTENDEX_UPSTREAM_ERROR'` and carries the upstream status.
  - [x] Importing `Book`, `BookRepository`, `GutendexClient` from `@dialogus/catalog` resolves.
  - [x] Barrel does NOT export any symbol from `infrastructure/` (empty folder at this task, but the constraint is permanent).
- Integration tests:
  - [ ] Deferred to task_13 / task_14.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Downstream tasks (07, 08, 09, 10) can import `Book`, ports, and error classes from `@dialogus/catalog`.
- Folder structure matches m5nita's `domain/<aggregate>/` pattern.
