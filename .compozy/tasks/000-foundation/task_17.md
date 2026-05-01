---
status: completed
title: Implement web lib/health fetcher with tests
type: frontend
complexity: low
dependencies:
  - task_07
  - task_16
---

# Task 17: Implement web lib/health fetcher with tests

## Overview

Implement `apps/web/src/lib/health.ts` that fetches `/health` from `apps/api` and validates the response via `healthResponseSchema` before returning typed data. Called from the landing Server Component (task_18) during render to prove the cross-process wiring.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST export `fetchHealth(): Promise<HealthResponse>` from `apps/web/src/lib/health.ts`.
- MUST read `NEXT_PUBLIC_API_URL` from `process.env` (default `'http://localhost:3001'` if absent).
- MUST call `fetch(\`${base}/health\`, { cache: 'no-store' })` — explicit `no-store` even though Next 16 defaults to it (per Foundation TechSpec Known Risks).
- MUST validate the response via `healthResponseSchema.safeParse()` from `@dialogus/shared/schemas/health`.
- On fetch failure (network error, non-2xx status), MUST return `{ api: 'up', db: 'down', pgboss: 'down' }` to match the fallback UX in task_18.
- On schema validation failure, MUST treat it as a fetch failure (same fallback).
- MUST NOT throw — the Server Component must render even when api is unreachable.

</requirements>

## Subtasks

- [x] 17.1 Implement `fetchHealth()` with explicit `cache: 'no-store'`.
- [x] 17.2 Wrap the fetch in a try/catch + schema parse, returning the fallback on any failure.
- [x] 17.3 Read base URL from `NEXT_PUBLIC_API_URL` with a default.
- [x] 17.4 Write unit tests with mocked `fetch`.

## Implementation Details

Reference Foundation TechSpec Build Order Step 6 and Known Risks (Next 16 caching defaults). Schema comes from `@dialogus/shared/schemas/health` (task_07).

### Relevant Files

- `@dialogus/shared/schemas/health` (task_07).
- Foundation TechSpec § Implementation Design.
- Foundation TechSpec § Known Risks (Next 16 fetch caching).

### Dependent Files

- `./apps/web/src/lib/health.ts` (new)
- `./apps/web/__tests__/lib/health.test.ts` (new)

### Related ADRs

- [ADR-001: Linear + transparent delivery with E2E wiring and Day-1 polish](adrs/adr-001.md) — this fetcher is the proof-of-wiring mechanism.

## Deliverables

- `fetchHealth` exported from `apps/web/src/lib/health.ts`.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — covered by task_21 smoke (real server + real web).

## Tests

- Unit tests:
  - [x] Happy path: fetch returns schema-valid JSON → `fetchHealth` returns the parsed object.
  - [x] Network error: mocked fetch throws → `fetchHealth` returns `{ api: 'up', db: 'down', pgboss: 'down' }` without throwing.
  - [x] Non-2xx status: mocked fetch returns 500 → fallback shape.
  - [x] Schema invalid: mocked fetch returns `{ foo: 'bar' }` → fallback shape.
  - [x] Fetch is called with `cache: 'no-store'` option.
  - [x] `NEXT_PUBLIC_API_URL` missing → base defaults to `http://localhost:3001`.
- Integration tests:
  - [ ] Deferred to task_21 (real api on 3001, real web call succeeds).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `fetchHealth` never throws under any mocked failure condition.
- Explicit `cache: 'no-store'` is always passed to `fetch`.
