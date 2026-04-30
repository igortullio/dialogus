---
status: completed
title: CI integration job with Testcontainers
type: infra
complexity: medium
dependencies:
  - task_12
  - task_13
  - task_14
---

# Task 17: CI integration job with Testcontainers

## Overview

Extend `.github/workflows/ci.yml` with a fourth job, `integration`, that runs `pnpm test:integration` using Testcontainers on the GitHub Actions runner. This is the first use of integration tests in the project; the job gates the `build` job in the pipeline so a red integration test stops merges.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST extend `.github/workflows/ci.yml` with a new `integration` job:
  - Runs in parallel with `test` (both depend on repo checkout + pnpm install).
  - Uses Docker-in-Docker capability on the runner (GitHub ubuntu-latest runners have Docker available by default).
  - Runs `pnpm test:integration`.
  - Timeout: 15 minutes max.
- MUST add root `package.json` script `test:integration` that invokes `pnpm -r --filter=apps/api test:integration` (runs only in apps/api for now; other packages join as features 002-004 add suites).
- MUST add `vitest.integration.config.ts` at `apps/api/` with: `include: ['**/*.integration.test.ts']`, `pool: 'forks'`, `testTimeout: 30_000`, `hookTimeout: 30_000`.
- MUST add `apps/api/package.json` script `test:integration` invoking `vitest run --config vitest.integration.config.ts`.
- The `build` job MUST add `needs: [lint-and-typecheck, test, integration]` so integration failures block builds.
- Pre-commit hook MUST remain unchanged (integration tests stay out of pre-commit per ADR-007 product-level).
- MUST ensure Testcontainers can pull `pgvector/pgvector:pg18` in CI — the image is public; no registry auth required.

</requirements>

## Subtasks

- [x] 17.1 Add `vitest.integration.config.ts` to `apps/api/`.
- [x] 17.2 Add `test:integration` scripts at root and in `apps/api/package.json`.
- [x] 17.3 Add `integration` job to `ci.yml` with Docker-in-Docker + timeout.
- [x] 17.4 Update `build` job's `needs` array.
- [x] 17.5 Push to branch + verify green CI across 4 jobs.

## Implementation Details

Reference Feature 001 TechSpec § Testing Approach → Integration Tests and Foundation `ci.yml` (Foundation task_19) as the base workflow. `@testcontainers/postgresql@^11` is added as devDep in task_12 and 14 — the runner simply needs Docker available, which GitHub ubuntu-latest provides.

### Relevant Files

- Foundation `.github/workflows/ci.yml` (Foundation task_19).
- `/Users/igortullio/Developer/igortullio/m5nita/.github/workflows/ci.yml` — reference for a parallel-jobs CI layout.
- Feature 001 TechSpec § Integration Tests.

### Dependent Files

- `.github/workflows/ci.yml` (modify: add `integration` job, update `build.needs`)
- `package.json` (modify: add `test:integration` root script)
- `apps/api/package.json` (modify: add `test:integration` script + `@testcontainers/postgresql` devDep)
- `apps/api/vitest.integration.config.ts` (new)

### Related ADRs

- [ADR-007: Testcontainers for integration tests, CI-only](../../000-foundation/adrs/adr-007.md) (Foundation) — foundational mandate.

## Deliverables

- CI `integration` job live and green on first push.
- Unit tests with 80%+ coverage **(REQUIRED)** — workflow YAML structural checks.
- Integration tests **(REQUIRED)** — the `integration` job itself IS the integration test harness; green on first push satisfies this.

## Tests

- Unit tests:
  - [x] `ci.yml` parses as valid GitHub Actions YAML.
  - [x] `ci.yml` has four jobs: `lint-and-typecheck`, `test`, `integration`, `build`.
  - [x] `build.needs` includes `integration`.
  - [x] `integration` job's timeout is ≤ 15 minutes.
  - [x] Root `package.json` exposes `test:integration` script.
  - [x] `apps/api/vitest.integration.config.ts` includes `*.integration.test.ts` only (excluded from default `test` config).
- Integration tests:
  - [x] First CI push after this task: all 4 jobs green, wall-clock ≤ 10 minutes total.
  - [x] Deliberately-broken integration test PR: `integration` job fails, `build` is skipped, merge blocked.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- CI shows 4-badge status on README (lint-and-typecheck, test, integration, build).
- `pnpm test:integration` runs locally without errors when Docker Desktop is available.
