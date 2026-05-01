---
status: completed
title: "CI integration job extension"
type: infra
complexity: low
dependencies:
  - task_09
---

# Task 10: CI integration job extension

## Overview

Extend the existing GitHub Actions `integration` job (established in Feature 001 task_11 and further extended in Feature 002 task_16) to pick up Feature 003's integration test suites. This task is low-complexity: the integration job already runs via Vitest's `*.integration.test.ts` include pattern, so adding new suite files may "just work" — the task's real job is verifying the wall-clock budget, adjusting concurrency if needed, and documenting the new suites in the CI README section.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST verify that `.github/workflows/ci.yml`'s `integration` job picks up the 5 new suites from task_09 without configuration changes (Vitest's include pattern covers them). If additional include patterns are needed, add them to `apps/mastra/vitest.integration.config.ts` (new, from task_09) and reference from the CI job.
- MUST ensure the `integration` job has access to the required env vars at CI runtime: `DATABASE_URL` (Testcontainers provides), `ANTHROPIC_API_KEY` (unused — MSW mocks the endpoint, but config validation on boot may require presence — use a fixture value like `test-anthropic-key`), `OPENAI_API_KEY` (same — `test-openai-key`), `MASTRA_PORT=3002`, `NEXT_PUBLIC_MASTRA_URL=http://localhost:3002`.
- MUST verify the total `integration` job wall-clock stays within 15 minutes (the product-level budget). If the new suites push past the budget, parallelize — split into two jobs (`integration-api` + `integration-mastra`) that share the workflow configuration; document the split in the Impact Analysis section of TechSpec.
- MUST update the README's CI section (if one exists) or add one to `apps/mastra/README.md` (task_11 authors this file — coordinate) noting the 5 new suites and how to run locally: `pnpm --filter @dialogus/mastra test:integration`.
- MUST NOT introduce Docker-in-Docker complexity; the existing Testcontainers setup from Features 001/002 handles this.

</requirements>

## Subtasks

- [x] 10.1 Run the existing `integration` CI job against a branch that includes task_09's output; observe wall-clock.
- [x] 10.2 Adjust Vitest include patterns if new suites are not picked up automatically.
- [x] 10.3 Parallelize the job if wall-clock exceeds budget.
- [x] 10.4 Document the new suites in CI section (README or equivalent).
- [x] 10.5 Verify a green run on `main` after merging.

## Implementation Details

Reference `.github/workflows/ci.yml` (Foundation task_07, extended in Features 001 + 002). Vitest's default config for integration tests matches `*.integration.test.ts` across all workspaces — new files under `apps/mastra/__tests__/integration/` should be included automatically.

CI env-var handling: the `integration` job reads secrets from `github.secrets` for anything sensitive. `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in this job are fixture values (not real secrets) because MSW + `MockQueryEmbedder` short-circuit every external call. Document explicitly in the job step definition to prevent a future contributor from replacing the fixture with a real key.

### Relevant Files

- `.github/workflows/ci.yml` — the CI surface to extend.
- `apps/api/__tests__/integration/*.integration.test.ts` (Features 001 + 002) — reference pattern for CI inclusion.
- `apps/mastra/vitest.integration.config.ts` (task_09, new) — mastra-specific config.
- TechSpec § Testing Approach — integration budget.

### Dependent Files

- `.github/workflows/ci.yml` (modify: only if needed to augment env vars or split jobs)
- `apps/mastra/README.md` or root README (modify: CI documentation)
- `apps/mastra/vitest.integration.config.ts` (modify: only if needed)

### Related ADRs

- Product [ADR-007: Testcontainers, CI-only](../dialogus/adrs/adr-007.md).

## Deliverables

- Green CI integration job including the 5 new suites.
- Documentation of `test:integration` usage for `@dialogus/mastra`.
- Unit tests with 80%+ coverage **(REQUIRED)** — this task is primarily config; the unit coverage surface is the test discovery assertion (e.g., a meta-test asserting Vitest find N suites).
- Integration tests **(REQUIRED)** — the CI job itself exercises the suites; task_09 provides the content.

## Tests

- Unit tests:
  - [ ] `apps/mastra/__tests__/integration-discovery.test.ts` (or reuse existing discovery asserts from Features 001/002) — asserts `glob('**/*.integration.test.ts', { cwd: 'apps/mastra' })` returns ≥ 5 files.
- Integration tests:
  - [ ] CI `integration` job green on `main` after task_09 merges — verified via a smoke PR or direct push.
  - [ ] Wall-clock verification: the total `integration` job duration stays ≤ 15 minutes on the most recent main-branch run.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- CI `integration` job picks up all 5 new suites from task_09.
- Total integration wall-clock ≤ 15 minutes on `main`.
- No secrets misused: MSW/mocks handle all external calls.
