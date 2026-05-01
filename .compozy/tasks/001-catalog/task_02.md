---
status: completed
title: Add @dialogus/shared/http cursor codec
type: backend
complexity: medium
dependencies: []
---

# Task 2: Add @dialogus/shared/http cursor codec

## Overview

Implement the opaque cursor codec used by every cursor-paginated list endpoint in dIAlogus. Exposes `encodeCursor({ createdAt, id })` / `decodeCursor(token)` + `InvalidCursorError` at `@dialogus/shared/http/cursor`. Feature 001 library listing is the first consumer; features 002-004 reuse.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST expose `encodeCursor(position: { createdAt: Date; id: string }): string` at `@dialogus/shared/http/cursor`. Output is base64url-encoded JSON per ADR-005.
- MUST expose `decodeCursor(cursor: string): { createdAt: Date; id: string }` performing shape validation via a Zod schema (`createdAt` ISO-8601 datetime, `id` uuid).
- MUST throw `InvalidCursorError` (subclass of `DialogusError` with code `INVALID_CURSOR`) when decoding fails — bad base64, bad JSON, wrong shape, missing fields.
- MUST NOT include non-minimal fields (no `limit`, no `direction`) per ADR-005 Alternative 2 rejection.
- Add entry point `./http/cursor` to `@dialogus/shared/package.json` exports.
- Re-export `encodeCursor`, `decodeCursor`, `InvalidCursorError` from root `@dialogus/shared/http`.

</requirements>

## Subtasks

- [x] 2.1 Implement `encodeCursor` via `Buffer.from(JSON.stringify({ createdAt: iso, id })).toString('base64url')`.
- [x] 2.2 Implement `decodeCursor` with Zod-validated payload and typed failure.
- [x] 2.3 Implement `InvalidCursorError` in `@dialogus/shared/errors` (extends `DialogusError`).
- [x] 2.4 Extend `@dialogus/shared` exports + barrel.
- [x] 2.5 Write round-trip + negative tests.

## Implementation Details

Reference Feature 001 ADR-005 "Implementation Notes" for the exact `encodeCursor` / `decodeCursor` skeletons. Schema lives alongside the codec: `cursorPayloadSchema = z.object({ createdAt: z.string().datetime(), id: z.string().uuid() })`.

### Relevant Files

- Feature 001 ADR-005: [Tuple cursor base64 JSON](adrs/adr-005.md).
- Feature 001 TechSpec § Core Interfaces.
- `packages/shared/src/errors/index.ts` (from Foundation task_07) — `InvalidCursorError` extends `DialogusError` here.

### Dependent Files

- `packages/shared/src/http/cursor.ts` (new)
- `packages/shared/src/http/index.ts` (modify barrel)
- `packages/shared/src/errors/index.ts` (modify: add `InvalidCursorError`)
- `packages/shared/package.json` (modify: `exports` entry `./http/cursor`)
- `packages/shared/__tests__/http/cursor.test.ts` (new)

### Related ADRs

- [ADR-005: Tuple cursor `{created_at, id}` base64 JSON](adrs/adr-005.md) — authoritative decision this task implements.

## Deliverables

- `encodeCursor`, `decodeCursor`, `InvalidCursorError` exported from `@dialogus/shared/http`.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_14 (`cursor.integration.test.ts`).

## Tests

- Unit tests:
  - [x] Round-trip: `decodeCursor(encodeCursor({ createdAt: d, id: 'uuid' }))` returns the original.
  - [x] Encoded cursor is URL-safe (no `+`, `/`, or `=`).
  - [x] `decodeCursor('not-base64')` throws `InvalidCursorError` with code `INVALID_CURSOR`.
  - [x] `decodeCursor(base64('{"createdAt":"bad","id":"1"}'))` throws — invalid datetime.
  - [x] `decodeCursor(base64('{"createdAt":"<valid>"}'))` throws — missing `id`.
  - [x] `decodeCursor(base64('{}'))` throws — missing both fields.
- Integration tests:
  - [ ] Deferred to task_14 (real GET /api/library/books paginates through 50-row dataset).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Downstream repository adapters (task_07) can use `decodeCursor` directly on query strings.
- No task can accidentally smuggle non-minimal fields (limit/direction) through the cursor — type system forbids.
