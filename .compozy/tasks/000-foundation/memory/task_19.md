# Task Memory: task_19.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Ship `.github/workflows/ci.yml` with 3 parallel jobs (lint-and-typecheck, test, build) on Node 22 + Corepack pnpm@9.15.4. No Postgres service, no bundle budgets. PRs cancel in-progress concurrently; main pushes are preserved.

## Important Decisions

- `pull_request:` is left unfiltered (no `branches:` key) so PRs targeting any future branch run CI. The task spec says "and `pull_request`" without a branch constraint.
- `cancel-in-progress` uses the m5nita-style expression `${{ github.ref != 'refs/heads/main' }}` — evaluates `true` for PRs, `false` for main, satisfying both the literal-`true`-for-PRs requirement and the no-cancel-on-main requirement.
- `actions/setup-node@v4` and `actions/checkout@v4` pinned per task spec (not `@v6` as in m5nita).
- Corepack activation is its own `run:` step BEFORE `actions/setup-node@v4` so setup-node's `cache: pnpm` resolution finds the activated pnpm shim.
- Subtask 19.5 (act/first-push verification) is gated on the first push after this commit — structural Vitest test (`__tests__/ci-workflow.test.ts`) substitutes for `act` locally. Mark 19.5 done after first green CI run lands on `main`.

## Learnings

- `yaml@2` parses GitHub Actions `on:` as the literal key string `"on"` (YAML 1.2, no `on/off` boolean coercion) — structural tests can read `workflow.on.push.branches` without quirks.
- Empty trigger blocks like `pull_request:` parse to `null`, not `{}` — assert presence via `Object.keys(workflow.on).includes('pull_request')` rather than property access.
- Biome flags template-literal-style strings inside double quotes as a warning (e.g., `'${{ ... }}'` and `'${POSTGRES_*}'`) but only ERRORS on auto-formattable layout issues. The 5 warnings present (4 docker-compose + 1 ci-workflow) are pre-existing-style warnings; lint exits 0.

## Files / Surfaces

- `.github/workflows/ci.yml` (new)
- `__tests__/ci-workflow.test.ts` (new, 13 tests)

## Errors / Corrections

- First Write of `__tests__/ci-workflow.test.ts` had an `expect(...).toEqual([...].sort())` that biome wanted on a single line; `pnpm lint:fix` collapsed it. No semantic change.

## Ready for Next Run

- Task 20 (README finalization) and task 21 (smoke + closure) are next; both depend on task_19 being committed but not necessarily green-on-CI yet. Task 21's "first push to main yields green CI" success criterion is the natural place to confirm subtask 19.5.
- A README "Next Steps" / "Architecture" update by task_20 should mention the CI badge once `main` has its first green run.
