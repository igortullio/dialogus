---
status: completed
title: 'apps/web landing "livros: X (prontos: N)" extension'
type: frontend
complexity: low
dependencies:
  - task_14
---

# Task 17: apps/web landing "livros: X (prontos: N)" extension

## Overview

Extend the apps/web landing Server Component (built in Feature 001 task_16) to display an ingestion-ready count alongside the existing library count: "livros: X (prontos: N)". Adds a small fetch helper that queries `GET /api/library/books?status=ready&limit=1` to read `meta.count`.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST extend `apps/web/src/lib/library.ts` (from Feature 001 task_16) with a new helper `fetchLibraryCountByStatus(): Promise<{ total: number; ready: number }>`:
  - Fetches `${NEXT_PUBLIC_API_URL}/api/library/books?limit=1` and reads `meta.count` → total.
  - Fetches `${NEXT_PUBLIC_API_URL}/api/library/books?status=ready&limit=1` and reads `meta.count` → ready.
  - Both fetches run in parallel via `Promise.all`.
  - On any failure, returns `{ total: 0, ready: 0 }` (no crash).
  - Uses `cache: 'no-store'` explicitly.
- MUST modify `apps/web/src/app/page.tsx` to call `fetchLibraryCountByStatus()` alongside `fetchHealth()` (via `Promise.all`); render the status line as "dIAlogus — api: X / db: Y / pgboss: Z / livros: T (prontos: N)".
- MUST remain a Server Component (no `'use client'` directive).
- Rendering MUST handle `total=0` gracefully: "livros: 0 (prontos: 0)".

</requirements>

## Subtasks

- [x] 17.1 Implement `fetchLibraryCountByStatus` with parallel fetches.
- [x] 17.2 Update `page.tsx` to include total + ready in status line.
- [x] 17.3 Unit tests for the new helper + render test for the extended page.

## Implementation Details

Reference Feature 002 TechSpec § Build Order step 12. `status=ready` is a valid filter on `GET /api/library/books` per Feature 001 task_14's `listLibraryQuerySchema`.

### Relevant Files

- `apps/web/src/lib/library.ts` (from Feature 001 task_16).
- `apps/web/src/app/page.tsx` (from Feature 001 task_16).
- `apps/web/src/lib/health.ts` (from Foundation task_17).
- Feature 001 task_14 `listLibraryQuerySchema` (confirms status filter + meta.count contract).

### Dependent Files

- `apps/web/src/lib/library.ts` (modify: add `fetchLibraryCountByStatus`)
- `apps/web/src/app/page.tsx` (modify: extended status line)
- `apps/web/__tests__/lib/library.test.ts` (modify: new tests for helper)
- `apps/web/__tests__/app/page.test.tsx` (modify: expect `prontos: N` in output)

## Deliverables

- Extended landing with ingestion-ready count.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_18 smoke.

## Tests

- Unit tests:
  - [x] `fetchLibraryCountByStatus`: both mocked responses return `{ meta: { count: 3 } }` (total) and `{ meta: { count: 2 } }` (ready) → returns `{ total: 3, ready: 2 }`.
  - [x] Either fetch throws → returns `{ total: 0, ready: 0 }` (no crash).
  - [x] Invalid response shape (missing `meta.count`) → returns `{ total: 0, ready: 0 }`.
  - [x] Both fetches use `cache: 'no-store'`.
  - [x] Both fetches run in parallel (assert both started before either resolves, via mock timing).
  - [x] `page.tsx` render output includes "livros: 3 (prontos: 2)" when mocks return 3/2.
  - [x] `page.tsx` render output includes "livros: 0 (prontos: 0)" when fetches fail.
- Integration tests:
  - [ ] Deferred to task_18.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Landing remains a Server Component with no added client-side JavaScript.
- Page rendering degrades gracefully when API is unreachable.
