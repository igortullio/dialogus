---
status: completed
title: "@dialogus/catalog DrizzleBookRepository + BookMapper"
type: backend
complexity: medium
dependencies:
  - task_04
  - task_06
---

# Task 7: @dialogus/catalog DrizzleBookRepository + BookMapper

## Overview

Implement the persistence adapter for `BookRepository`: `DrizzleBookRepository` talks to Postgres via Drizzle and the `books` schema from task_04, while `BookMapper` handles the translation between the on-disk row shape and the domain `Book` entity. Cursor pagination uses the tuple codec from task_02.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `packages/catalog/src/infrastructure/persistence/DrizzleBookRepository.ts` that satisfies `BookRepository` from task_06.
- MUST implement `packages/catalog/src/infrastructure/persistence/mappers/BookMapper.ts` with `toDomain(row)` and `toPersistence(book)` functions; round-trip MUST be lossless for every field including `tags: []` default.
- `list(filter, cursor?, limit?)` MUST perform tuple-compare filter: `WHERE (created_at, id) < (decoded.createdAt, decoded.id) ORDER BY created_at DESC, id DESC LIMIT <limit>` when cursor present; plain `ORDER BY ... LIMIT` when absent.
- `list` MUST default-filter out soft-deleted rows unless `filter.includeDeleted === true`.
- `softDelete` MUST only set `deleted_at = now()` and `updated_at = now()`; MUST NOT delete the row.
- `restore` MUST set `deleted_at = NULL` and `updated_at = now()`; throws `BookNotFoundError` if the book does not exist (regardless of `deleted_at` state).
- `findByGutendexId` MUST return the row even if soft-deleted (used to detect duplicates in POST flow).
- Add `drizzle-orm` + `postgres` as peer deps (already present via `@dialogus/db`); add `@dialogus/db@workspace:*` as dependency to inject the client.

</requirements>

## Subtasks

- [x] 7.1 Implement `BookMapper` with round-trip functions.
- [x] 7.2 Implement `DrizzleBookRepository` with all port methods.
- [x] 7.3 Wire cursor decode for `list`.
- [x] 7.4 Write unit tests using a mocked Drizzle client.
- [x] 7.5 Write round-trip mapper tests covering every field.

## Implementation Details

Reference Feature 001 TechSpec § Implementation Design for the repository shape and m5nita's `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts` + `mappers/PoolMapper.ts` as the template. Cursor decoding delegates to `decodeCursor` from `@dialogus/shared/http/cursor` (task_02).

### Relevant Files

- `packages/catalog/src/domain/book/BookRepository.port.ts` (task_06) — the port to satisfy.
- `packages/db/src/schema/books.ts` (task_04) — the table being queried.
- `packages/shared/src/http/cursor.ts` (task_02) — decode cursor helper.
- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts` — pattern reference.
- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/persistence/mappers/PoolMapper.ts` — pattern reference.

### Dependent Files

- `packages/catalog/src/infrastructure/persistence/DrizzleBookRepository.ts` (new)
- `packages/catalog/src/infrastructure/persistence/mappers/BookMapper.ts` (new)
- `packages/catalog/package.json` (modify: add `@dialogus/db@workspace:*`)
- `packages/catalog/__tests__/infrastructure/persistence/DrizzleBookRepository.test.ts` (new)
- `packages/catalog/__tests__/infrastructure/persistence/mappers/BookMapper.test.ts` (new)

### Related ADRs

- [ADR-005: Tuple cursor `{created_at, id}` base64 JSON](adrs/adr-005.md) — cursor filter implementation.

## Deliverables

- `DrizzleBookRepository` + `BookMapper` implemented with all methods.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_14 (`library.integration.test.ts` + `cursor.integration.test.ts`) which exercises real Postgres via Testcontainers.

## Tests

- Unit tests:
  - [x] `BookMapper.toDomain` converts a Drizzle row with all fields (including null `deleted_at`, empty `tags`, subject array) into a `Book` entity with no field loss.
  - [x] `BookMapper.toPersistence` is the inverse of `toDomain`.
  - [x] `save(book)` with a non-existent book ID inserts a new row; mocked Drizzle receives the correct INSERT call.
  - [x] `save(book)` with an existing ID performs UPDATE.
  - [x] `findById` returns `null` when mocked Drizzle returns empty.
  - [x] `findByGutendexId` returns the row even when `deleted_at IS NOT NULL`.
  - [x] `list(filter={}, cursor=undefined)` queries without cursor filter, ORDER BY `created_at DESC, id DESC`.
  - [x] `list(filter={}, cursor=<tuple>)` decodes the cursor and issues a tuple-compare filter.
  - [x] `list(filter={ includeDeleted: false })` adds `WHERE deleted_at IS NULL`.
  - [x] `list(filter={ includeDeleted: true })` omits that clause.
  - [x] `softDelete(id)` with mocked existing row sets `deleted_at = now()` only.
  - [x] `restore(id)` for a non-existent ID throws `BookNotFoundError`.
- Integration tests:
  - [ ] Deferred to task_14 (real Postgres paginates 50 inserted books through 2 cursor pages).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `DrizzleBookRepository` compiles and type-checks against the port + Drizzle schema.
- Mapper round-trip preserves every field including edge cases (empty arrays, null FKs).
