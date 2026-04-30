---
status: completed
title: 'apps/web landing "livros: N" extension'
type: frontend
complexity: low
dependencies:
    - task_14
---

# Task 16: apps/web landing "livros: N" extension

## Overview

Extend the Foundation-built `apps/web` landing Server Component to also fetch the library count from `GET /api/library/books?limit=1` and render it in the status line alongside the existing "api: up / db: up / pgboss: up" items. The count comes from `meta.count` in the envelope response.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add `apps/web/src/lib/library.ts` exporting `fetchLibraryCount(): Promise<number>` that fetches `${NEXT_PUBLIC_API_URL}/api/library/books?limit=1` and returns `response.meta.count` (defaults to 0 on any error — landing must never 500 just because the API is down).
- MUST use `cache: 'no-store'` explicitly (matching Foundation's health-fetcher pattern).
- MUST validate response via `listLibraryResponseSchema` from `@dialogus/shared/schemas/library`; on parse failure, default to 0.
- MUST modify `apps/web/src/app/page.tsx` to fetch health AND library count in parallel via `Promise.all([fetchHealth(), fetchLibraryCount()])` and render the status line as "dIAlogus — api: X / db: Y / pgboss: Z / livros: N".
- Rendering MUST continue to be a Server Component (no `'use client'`).
- No styling changes beyond what Foundation already has.

</requirements>

## Subtasks

- [x] 16.1 Implement `fetchLibraryCount` with Zod validation + fallback to 0.
- [x] 16.2 Modify `page.tsx` to parallel-fetch health + count.
- [x] 16.3 Render "livros: N" in the status line.
- [x] 16.4 Unit tests with mocked fetch for library count.

## Implementation Details

Reference Feature 001 TechSpec § Data Flow and § Build Order step 9 for the exact fetch strategy. The `meta.count` field is guaranteed by the library list response envelope per Feature ADR-002.

### Relevant Files

- Foundation `apps/web/src/lib/health.ts` (Foundation task_17) — pattern reference.
- Foundation `apps/web/src/app/page.tsx` (Foundation task_18).
- `packages/shared/src/schemas/library.ts` (task_03) — `listLibraryResponseSchema`.

### Dependent Files

- `apps/web/src/lib/library.ts` (new)
- `apps/web/src/app/page.tsx` (modify: parallel fetch + extended status line)
- `apps/web/__tests__/lib/library.test.ts` (new)
- `apps/web/__tests__/app/page.test.tsx` (modify: expect `livros: N` in output)

## Deliverables

- Landing shows "livros: N" alongside existing status items.
- Fallback to `livros: 0` on API failure (no crash).
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_18 smoke (real server + real landing).

## Tests

- Unit tests:
  - [x] Happy path: mocked fetch returns envelope `{ data: [], meta: { count: 3 } }` → `fetchLibraryCount` returns 3.
  - [x] Fetch throws → returns 0.
  - [x] Non-2xx response → returns 0.
  - [x] Response shape invalid (missing `meta.count`) → returns 0.
  - [x] Fetch called with `cache: 'no-store'`.
  - [x] `page.tsx` render output includes "livros: 3" when count is 3.
  - [x] `page.tsx` render output shows "livros: 0" when library count fetch fails.
- Integration tests:
  - [ ] Deferred to task_18.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Landing never crashes due to library-count fetch failure.
- Page is still a Server Component with zero client-side JavaScript added.
