---
status: completed
title: apps/api idempotency middleware
type: backend
complexity: medium
dependencies:
  - task_05
  - task_11
---

# Task 12: apps/api idempotency middleware

## Overview

Add the Hono middleware that reads the `Idempotency-Key` header on opt-in POST routes, computes a canonical hash of the request body, and either replays a cached 201 response or registers a new one into the `idempotency_keys` table after a successful handler invocation. Returns 422 on hash mismatch per ADR-003.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `apps/api/src/infrastructure/http/middleware/idempotency.ts` as a Hono middleware factory `idempotency({ db: Database }): MiddlewareHandler`.
- No `Idempotency-Key` header → middleware is a no-op and handler runs normally.
- With header present:
  - Compute `request_hash = sha256(canonicalizeBody(body))` where `canonicalizeBody` serializes with sorted object keys.
  - SELECT row by `key` from `idempotency_keys`.
  - If row exists and `request_hash === stored.request_hash` → return `stored.response_status` + `stored.response_body` as JSON, setting `X-Idempotency-Replay: true` header.
  - If row exists and hashes differ → throw new error class `IdempotencyKeyConflictError` (handled by task_11 problem middleware as 422 + slug `idempotency-key-conflict`).
  - If row absent → run the downstream handler; on success (2xx), INSERT `(key, request_hash, response_status, response_body)` before returning the response.
- MUST NOT store non-2xx responses in the table — failed requests should be retryable.
- MUST write `canonicalizeBody(body)` as an exported helper (used by future features too); put it in `apps/api/src/infrastructure/http/middleware/idempotency.ts` for V1.
- MUST emit pino log entries on replay (`X-Idempotency-Replay: true`), conflict, and insert events.
- Add `IdempotencyKeyConflictError` to `@dialogus/shared/errors` + register 422 mapping in task_11 middleware.

</requirements>

## Subtasks

- [x] 12.1 Implement `canonicalizeBody` + `sha256` helper.
- [x] 12.2 Implement the middleware factory with the four branches (absent, miss, hit-match, hit-mismatch).
- [x] 12.3 Add `IdempotencyKeyConflictError` and extend problem middleware mapping.
- [x] 12.4 Wire pino logs on replay / conflict / insert.
- [x] 12.5 Unit tests with mocked DB covering all branches.
- [x] 12.6 Integration test `idempotency.integration.test.ts` using Testcontainers.

## Implementation Details

Reference Feature 001 TechSpec § System Architecture data-flow step 7 and ADR-003 Implementation Notes for the exact middleware behavior. The cleanup job is a separate task (task_15).

### Relevant Files

- `packages/db/src/schema/idempotency_keys.ts` (task_05).
- `packages/shared/src/errors/index.ts` (Foundation task_07) — `IdempotencyKeyConflictError` added here.
- `apps/api/src/infrastructure/http/middleware/problem.ts` (task_11) — 422 mapping added here.

### Dependent Files

- `apps/api/src/infrastructure/http/middleware/idempotency.ts` (new)
- `packages/shared/src/errors/index.ts` (modify: add `IdempotencyKeyConflictError`)
- `apps/api/src/infrastructure/http/middleware/problem.ts` (modify: map 422)
- `apps/api/__tests__/middleware/idempotency.test.ts` (new)
- `apps/api/__tests__/integration/idempotency.integration.test.ts` (new)

### Related ADRs

- [ADR-003: Idempotency-Key stored in dedicated table](adrs/adr-003.md).

## Deliverables

- Idempotency middleware implemented with the four branches.
- `IdempotencyKeyConflictError` added + mapped to 422.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration test `idempotency.integration.test.ts` **(REQUIRED)** against real Testcontainers Postgres.

## Tests

- Unit tests:
  - [x] No header → handler invoked once, no DB access.
  - [x] Header + body, no existing row (mocked DB returns null) → handler invoked, INSERT performed with the handler's response.
  - [x] Header + body, existing row same hash → handler NOT invoked, cached response returned with `X-Idempotency-Replay: true`.
  - [x] Header + body, existing row different hash → `IdempotencyKeyConflictError` thrown.
  - [x] Handler returns 500 → no INSERT (only 2xx is persisted).
  - [x] `canonicalizeBody({ b: 2, a: 1 })` equals `canonicalizeBody({ a: 1, b: 2 })`.
- Integration tests:
  - [x] Real Postgres, two POSTs with same key + body → second returns identical body + status + `X-Idempotency-Replay: true`.
  - [x] Real Postgres, two POSTs same key different body → second returns 422 Problem Details `idempotency-key-conflict`.
  - [x] Real Postgres, POST then sleep 24 h (simulated via direct DELETE of key) → subsequent POST with same key runs the handler fresh.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Middleware is opt-in — can be applied per-route, not forced global.
- Idempotency contract holds across an `apps/api` restart (integration test validates with real DB).
