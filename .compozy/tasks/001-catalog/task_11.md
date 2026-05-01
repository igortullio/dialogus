---
status: completed
title: apps/api problem middleware (RFC 9457 converter)
type: backend
complexity: low
dependencies:
  - task_01
---

# Task 11: apps/api problem middleware (RFC 9457 converter)

## Overview

Add Hono middleware that catches errors from downstream handlers and converts known `DialogusError` subclasses into RFC 9457 Problem Details JSON responses via `problemDetails()` from `@dialogus/shared/http`. Unknown errors are logged and converted to a generic 500 without leaking stack traces.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `apps/api/src/infrastructure/http/middleware/problem.ts` as a Hono middleware.
- Middleware MUST catch thrown errors and map known `DialogusError` subclasses to Problem Details:
  - `DuplicateBookError` → 409 + slug `duplicate-gutendex-id`
  - `BookNotFoundError` → 404 + slug `book-not-found`
  - `GutendexUpstreamError` → 503 + slug `gutendex-upstream-error` + `Retry-After: 60` header
  - `InvalidCursorError` → 400 + slug `invalid-cursor`
  - `ValidationError` (from Zod) → 400 + slug `validation-failed` + `errors[]` extension listing field issues
  - `ConfigError` → 500 + slug `internal-error` (boot errors shouldn't reach here, but defensive)
  - unknown error → 500 + slug `internal-error`; log stack at ERROR level; response body carries a generic `detail: 'unexpected error'` (no stack leak)
- Response Content-Type MUST be `application/problem+json`.
- Middleware MUST be registered globally in task_15 boot changes so every route is covered.
- MUST NOT catch non-error throws (e.g., Response redirects) — only `instanceof Error`.
- MUST add pino log entry per error: `{ trace_id, error_code, error_name, status, path }`.

</requirements>

## Subtasks

- [x] 11.1 Implement `problem` middleware with the error-type mapping table.
- [x] 11.2 Emit `Retry-After` header on `GutendexUpstreamError`.
- [x] 11.3 Log errors via pino with structured fields.
- [x] 11.4 Unit tests covering each mapped error class + unknown fallback.

## Implementation Details

Reference Feature 001 TechSpec § Technical Considerations → Key Decision on RFC 9457 URIs. Use `problemDetails()` from `@dialogus/shared/http/problem` (task_01). Zod `ZodError` converts via a helper `zodIssuesToValidationIssues(zodError)` defined inline.

### Relevant Files

- `packages/shared/src/http/problem.ts` (task_01).
- `packages/catalog/src/domain/book/BookError.ts` (task_06).
- `packages/shared/src/errors/index.ts` (foundation task_07) — error hierarchy.

### Dependent Files

- `apps/api/src/infrastructure/http/middleware/problem.ts` (new)
- `apps/api/__tests__/middleware/problem.test.ts` (new)

### Related ADRs

- [ADR-002: Portfolio-grade 2026 API contract](adrs/adr-002.md) — RFC 9457 Problem Details mandate.

## Deliverables

- Problem middleware implemented and unit-tested.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_13 / task_14 where routes throw real errors and the middleware converts.

## Tests

- Unit tests:
  - [x] Handler throws `BookNotFoundError('uuid')` → middleware returns 404 with Problem Details body `{ type: 'urn:dialogus:problems:book-not-found', ... }` and `Content-Type: application/problem+json`.
  - [x] Handler throws `DuplicateBookError(996, 'existing-uuid')` → 409 Problem Details with `existing_book_id` extension.
  - [x] Handler throws `GutendexUpstreamError(503, 'timeout')` → 503 Problem Details + `Retry-After: 60` header.
  - [x] Handler throws `InvalidCursorError('bad')` → 400 Problem Details `invalid-cursor`.
  - [x] Handler throws Zod error → 400 Problem Details `validation-failed` with `errors` array listing field paths.
  - [x] Handler throws `new Error('anything')` → 500 Problem Details `internal-error` with generic `detail` (no stack leak); pino log at ERROR level includes the stack.
  - [x] Handler returns successfully → middleware does not alter the response.
- Integration tests:
  - [ ] Deferred to task_13 / task_14.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- No path in middleware leaks a stack trace in the response body.
- Every slug used by the middleware appears in the README "API Problems" section (documented in task_18 closure).
