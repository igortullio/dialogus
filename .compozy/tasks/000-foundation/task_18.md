---
status: completed
title: Implement landing Server Component with tests
type: frontend
complexity: medium
dependencies:
  - task_16
  - task_17
---

# Task 18: Implement landing Server Component with tests

## Overview

Replace the placeholder `page.tsx` from task_16 with the real landing Server Component that calls `fetchHealth()` at render time and displays a status line "dIAlogus — api: {api} / db: {db} / pgboss: {pgboss}". This is the visible proof of end-to-end wiring required by ADR-001.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST be an async Server Component (no `'use client'` directive).
- MUST call `fetchHealth()` at render time.
- MUST render an `<h1>` with text `dIAlogus`.
- MUST render a status line containing `api: {value}`, `db: {value}`, `pgboss: {value}` where values are rendered as plain strings `up` or `down` (English per PRD Open Questions default).
- MUST not add client-side JavaScript, Tailwind, or shadcn components.
- MUST style with inline styles or a minimal bare-CSS block — no external CSS library.
- Visible text MUST include `dIAlogus` and the three status values verbatim.

</requirements>

## Subtasks

- [x] 18.1 Replace `page.tsx` placeholder with an async Server Component.
- [x] 18.2 Call `fetchHealth()` and destructure the result.
- [x] 18.3 Render `<h1>dIAlogus</h1>` + status line with the three values.
- [x] 18.4 Apply a minimal bare-CSS style block for legibility (no external library).
- [x] 18.5 Write a render test that mocks `fetchHealth` and asserts the rendered text.

## Implementation Details

Reference Foundation TechSpec Build Order Step 6 and ADR-001 for the E2E wiring requirement. The component must remain server-only — `fetchHealth` runs server-side, not in the browser.

### Relevant Files

- `apps/web/src/lib/health.ts` (from task_17).
- Foundation TechSpec § System Architecture → data flow.
- Foundation ADR-001: [Linear + transparent delivery with E2E wiring and Day-1 polish](adrs/adr-001.md).

### Dependent Files

- `./apps/web/src/app/page.tsx` (modify: full implementation)
- `./apps/web/__tests__/app/page.test.tsx` (new)

### Related ADRs

- [ADR-001: Linear + transparent delivery with E2E wiring and Day-1 polish](adrs/adr-001.md) — landing is the visible E2E wiring proof.

## Deliverables

- `page.tsx` rendering status line from real `fetchHealth()`.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — covered by task_21 smoke.

## Tests

- Unit tests:
  - [x] With mocked `fetchHealth` returning all `'up'`: rendered HTML contains `dIAlogus`, `api: up`, `db: up`, `pgboss: up`.
  - [x] With `db: 'down'`: rendered HTML contains `db: down`.
  - [x] With `pgboss: 'down'`: rendered HTML contains `pgboss: down`.
  - [x] Component is async and returns JSX (not a Promise of a client component).
  - [x] No `'use client'` directive at the top of the file.
- Integration tests:
  - [ ] Deferred to task_21 (real server running → HTTP GET `/` returns HTML containing the expected status values).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- A fresh `pnpm dev` + docker compose shows "dIAlogus — api: up / db: up / pgboss: up" at `http://localhost:3000`.
- Stopping Postgres and refreshing shows the corresponding `down` states without a cryptic 500.
