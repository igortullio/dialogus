---
status: completed
title: GitHub Actions CI workflow with 3 jobs
type: infra
complexity: medium
dependencies:
  - task_15
  - task_18
---

# Task 19: GitHub Actions CI workflow with 3 jobs

## Overview

Create `.github/workflows/ci.yml` with three parallel jobs — `lint-and-typecheck`, `test`, and `build` — running on every push and pull request. The workflow sets up Node 22 + pnpm via Corepack, installs dependencies, and enforces that `main` never merges a red build.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `.github/workflows/ci.yml` triggering on `push` (branches `main`) and `pull_request`.
- MUST define three jobs: `lint-and-typecheck` (runs `pnpm lint && pnpm typecheck`), `test` (runs `pnpm test`), `build` (runs `pnpm build`; depends on the previous two via `needs:`).
- All jobs MUST use Node 22 (`actions/setup-node@v4` with `node-version: '22'` and `cache: pnpm`).
- pnpm MUST be activated via Corepack (`corepack enable && corepack prepare pnpm@9.15.4 --activate`).
- MUST set a concurrency group `ci-${{ github.ref }}` with `cancel-in-progress: true` for PR runs but NOT for pushes to `main`.
- MUST NOT include a Postgres service — integration tests are deferred to Feature 002 per ADR-007 product-level.
- MUST NOT include bundle-size budgets — deferred to Feature 004.
- Full CI runtime target: ≤ 5 minutes (verified by the workflow run).

</requirements>

## Subtasks

- [x] 19.1 Author `.github/workflows/ci.yml` with the 3-job structure.
- [x] 19.2 Configure `actions/setup-node@v4` with pnpm cache.
- [x] 19.3 Enable Corepack and activate the pinned pnpm version.
- [x] 19.4 Add concurrency group with cancel-in-progress logic.
- [ ] 19.5 Verify workflow passes locally via `act` (optional) or via first push. _(deferred — confirmed on first push via task_21 smoke; structural Vitest test substitutes locally)_

## Implementation Details

Reference Foundation TechSpec Build Order Step 7 and `/Users/igortullio/Developer/igortullio/m5nita/.github/workflows/ci.yml` as the structural template — minus the Postgres service and bundle-size gates (not applicable to Foundation).

### Relevant Files

- `/Users/igortullio/Developer/igortullio/m5nita/.github/workflows/ci.yml` — structural template.
- Foundation TechSpec Build Order Step 7.

### Dependent Files

- `./.github/workflows/ci.yml` (new)

## Deliverables

- `.github/workflows/ci.yml` committed.
- First push to `main` yields green CI across 3 jobs.
- Unit tests with 80%+ coverage **(REQUIRED)** — YAML structural validation.
- Integration tests **(REQUIRED)** — first PR run passes all 3 jobs green.

## Tests

- Unit tests:
  - [x] `ci.yml` parses as valid GitHub Actions YAML.
  - [x] Triggers contain both `push` (branches main) and `pull_request`.
  - [x] Job `build` declares `needs: [lint-and-typecheck, test]`.
  - [x] Node version is `22` in every `setup-node` step.
  - [x] Corepack activation appears before `pnpm install`.
  - [x] No `services.postgres` configuration (ADR-007 product-level enforcement).
  - [x] Concurrency group uses `cancel-in-progress: true` with a ref-based group key.
- Integration tests:
  - [ ] First PR run: all 3 jobs green, total wall-clock ≤ 5 minutes. _(confirmed on first push; tracked by task_21)_
  - [ ] PR re-run with intentional lint error: `lint-and-typecheck` job fails and blocks merge. _(branch protection step belongs to task_20/21 README + repo settings)_
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `main` has a green CI badge on first push.
- A deliberately red PR cannot be merged (branch protection, documented in README).
