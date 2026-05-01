---
status: completed
title: Foundation smoke test + closure
type: chore
complexity: medium
dependencies:
  - task_12
  - task_15
  - task_18
  - task_19
  - task_20
---

# Task 21: Foundation smoke test + closure

## Overview

Run the full manual smoke sequence defined in Foundation TechSpec § "Manual Smoke" against a freshly cloned repository, verify every exit criterion from the Foundation PRD, then declare Foundation V1 complete. This task is the Phase 1 gate — nothing in Feature 001 begins until all checks here pass.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST simulate a fresh clone: clone or reset the repo into a scratch directory, delete any `node_modules`, `.next`, `dist`, `./postgres-data` volume.
- MUST run the README quickstart verbatim: `corepack enable && pnpm install && docker compose up -d && pnpm db:migrate && pnpm dev`.
- MUST open `http://localhost:3000` in a browser and visually confirm "dIAlogus — api: up / db: up / pgboss: up".
- MUST stop Postgres (`docker compose stop postgres`), refresh `http://localhost:3000`, confirm text reads `db: down` and `pgboss: down` (rather than a 500 page).
- MUST restart Postgres, run `pnpm db:reset && pnpm db:migrate`, verify seed row and schemas recreate cleanly.
- MUST introduce a deliberate lint error, attempt `git commit`, verify pre-commit blocks it; revert the change.
- MUST confirm CI is green on `main` (all 3 jobs passed on last push).
- MUST measure end-to-end setup time from `git clone` to visible landing and report the figure against the PRD's ≤ 15-minute target.
- MUST measure pre-commit runtime against the PRD's ≤ 30-second target.
- MUST close out the Foundation feature by annotating `_prd.md` Exit Criteria section with timestamps + measurements (append at bottom without modifying other sections).

</requirements>

## Subtasks

- [x] 21.1 Simulate fresh clone in a scratch directory.
- [x] 21.2 Run quickstart verbatim and measure setup time.
- [x] 21.3 Verify landing page status line end-to-end.
- [x] 21.4 Verify Postgres-down fallback renders `db: down` cleanly.
- [x] 21.5 Verify `db:reset && db:migrate` recreates clean state.
- [x] 21.6 Verify pre-commit blocks a deliberately broken commit.
- [x] 21.7 Annotate `_prd.md` exit criteria with measured values + timestamp; commit with message `chore(repo): close feature 000-foundation [T021]`.

## Manual Validation Methods

This task validates Foundation through three complementary manual methods. Use whichever fits the assertion at hand; all three together constitute "Foundation V1 verified."

- **Endpoint testing** (cURL / httpie): hit `GET /health` directly, inspect the JSON envelope, assert `{ api: 'up', db: 'up'|'down', pgboss: 'up'|'down' }`. Reproducible via terminal — preferred for CI-grep-friendly output.
- **UI verification (Playwright MCP)**: when running this task with an AI assistant capable of browser automation (Playwright MCP), navigate to `http://localhost:3000`, take a screenshot, and verify the rendered text matches the expected status line. Also exercise the Postgres-down fallback by stopping the container and refreshing — the screenshot must show `db: down / pgboss: down` instead of a generic 500 page.
- **Output validation**: every assertion in the test list below names a specific input → expected output. No "happy path" hand-waving; each pass/fail is a measurable observation captured in the `_prd.md` Exit Criteria Verification annotation.

## Implementation Details

Reference Foundation TechSpec § Manual Smoke (the authoritative checklist) and Foundation PRD § Success Metrics (the numerical targets). Do NOT deviate from the exact commands the README prescribes — that's the whole point of the verbatim test.

### Relevant Files

- `README.md` (from task_20).
- Foundation TechSpec § Testing Approach → Manual Smoke.
- Foundation PRD § Goals + § Success Metrics.

### Dependent Files

- `./.compozy/tasks/000-foundation/_prd.md` (modify: append exit-criteria annotations)
- Optional: `./CHANGELOG.md` (new, if the repo adopts one at this point)

### Related ADRs

- [ADR-001: Linear + transparent delivery with E2E wiring and Day-1 polish](adrs/adr-001.md) — every exit criterion traces to this ADR.

## Deliverables

- Foundation PRD annotated with measured setup time, pre-commit time, and closure timestamp.
- Green CI on `main` with all 3 jobs passing.
- Unit tests with 80%+ coverage **(REQUIRED)** — structural check that the PRD annotation block exists.
- Integration tests **(REQUIRED)** — the manual smoke sequence IS the integration test here.

## Tests

- Unit tests:
  - [ ] Foundation `_prd.md` contains an "Exit Criteria Verification" section with timestamps.
  - [ ] Recorded setup time is ≤ 15 minutes (per PRD Success Metrics).
  - [ ] Recorded pre-commit runtime is ≤ 30 seconds.
- Integration tests:
  - [ ] Fresh-clone simulation reaches "api: up / db: up / pgboss: up" landing.
  - [ ] Postgres-down refresh shows `db: down / pgboss: down` (no 500).
  - [ ] `pnpm db:reset && pnpm db:migrate` recreates the canary row and extensions.
  - [ ] Pre-commit hook blocks a commit containing a Biome lint violation.
  - [ ] CI on `main` shows all 3 jobs passing on the most recent commit.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Every Foundation PRD exit criterion is annotated with measured or observed evidence.
- `main` is in a green-CI state and ready for Feature 001 (catalog) planning to begin.
