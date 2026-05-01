---
status: completed
title: Add @dialogus/shared/http envelope + problem helpers
type: backend
complexity: low
dependencies: []
---

# Task 1: Add @dialogus/shared/http envelope + problem helpers

## Overview

Introduce a new `@dialogus/shared/http` submodule with two small pure functions — `envelope()` that wraps response data with optional `meta` and `links`, and `problemDetails()` that produces an RFC 9457 `application/problem+json` body. These helpers are consumed by every route handler in catalog and every future feature.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add `src/http/envelope.ts` exporting `envelope(data, opts?)` with optional `meta` and `links` fields per TechSpec Core Interfaces.
- MUST add `src/http/problem.ts` exporting `problemDetails(slug, status, detail?, errors?)` returning an RFC 9457 shape with `type` URI = `urn:dialogus:problems:<slug>`.
- `problemDetails` MUST accept an optional `errors: ValidationIssue[]` extension for field-level validation failures.
- Add new entry points `./http/envelope` and `./http/problem` to the `exports` map of `@dialogus/shared/package.json`.
- Re-export from `packages/shared/src/index.ts` barrel.
- MUST NOT depend on Hono or any HTTP framework — functions stay framework-agnostic.

</requirements>

## Subtasks

- [x] 1.1 Implement `envelope` helper with the TechSpec signature.
- [x] 1.2 Implement `problemDetails` helper emitting `type: urn:dialogus:problems:<slug>`.
- [x] 1.3 Extend `@dialogus/shared` `exports` map and root barrel.
- [x] 1.4 Write unit tests covering happy path + optional fields for both helpers.

## Implementation Details

Reference Feature 001 TechSpec "Core Interfaces" for the exact function signatures. Both helpers are pure, synchronous, and return plain objects — no promises, no I/O.

### Relevant Files

- Feature 001 TechSpec § Core Interfaces (signatures).
- Feature 001 TechSpec § API Endpoints (shows envelope shape returned by routes).
- `/Users/igortullio/Developer/igortullio/dialogus/.compozy/tasks/000-foundation/task_05.md` — the `@dialogus/shared` scaffold that this task extends.

### Dependent Files

- `packages/shared/src/http/envelope.ts` (new)
- `packages/shared/src/http/problem.ts` (new)
- `packages/shared/src/http/index.ts` (new barrel)
- `packages/shared/package.json` (modify: extend `exports` map)
- `packages/shared/src/index.ts` (modify: re-export `./http`)
- `packages/shared/__tests__/http/envelope.test.ts` (new)
- `packages/shared/__tests__/http/problem.test.ts` (new)

### Related ADRs

- [ADR-002: Portfolio-grade 2026 API contract](adrs/adr-002.md) — envelope and Problem Details are the mandated response conventions.

## Deliverables

- `envelope`, `problemDetails` exported from `@dialogus/shared/http`.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_13 and task_14 where these helpers are invoked from real routes.

## Tests

- Unit tests:
  - [x] `envelope({ x: 1 })` returns `{ data: { x: 1 } }` (no meta, no links).
  - [x] `envelope({ x: 1 }, { meta: { count: 5 } })` returns `{ data: { x: 1 }, meta: { count: 5 } }`.
  - [x] `envelope([1, 2], { links: { next: '/?cursor=x' } })` returns `{ data: [1, 2], links: { next: '/?cursor=x' } }`.
  - [x] `problemDetails('validation-failed', 400, 'body is malformed')` returns `{ type: 'urn:dialogus:problems:validation-failed', title: string, status: 400, detail: 'body is malformed' }`.
  - [x] `problemDetails('book-not-found', 404, undefined, [{ field: 'id', message: 'not a uuid' }])` includes the `errors` extension.
  - [x] `type` URI always starts with `urn:dialogus:problems:`.
- Integration tests:
  - [ ] Deferred to task_13 / task_14 (routes emit these shapes and are verified against the on-the-wire responses).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Any downstream task can `import { envelope, problemDetails } from '@dialogus/shared/http'` without circular deps.
- Problem Details output validates against RFC 9457 minimum shape (`type`, `title`, `status` required).
