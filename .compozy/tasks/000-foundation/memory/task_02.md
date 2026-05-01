# Task Memory: task_02.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Wire Biome 2 and `.githooks/pre-commit` as the repo's lint + format + gate chain. Pre-commit must run lint + typecheck + unit tests but NOT integration tests.

## Important Decisions

- Split vitest into two configs: `vitest.config.ts` (unit, excludes `*.integration.test.ts`) and `vitest.integration.config.ts` (integration only). `pnpm test:integration` is the opt-in runner.
- Integration tests named `*.integration.test.ts`; they are NOT picked up by the default `pnpm test` and therefore do not run in pre-commit.
- Dropped `.worktrees`, `.claude/worktrees`, `.superpowers` from Biome excludes (m5nita-specific). Kept `node_modules`, `dist`, `build`, `coverage`, `.next`, `*.gen.ts`, `drizzle` per task requirement.
- Resolved Biome to `^2.4.8` (installed 2.4.13); schema pinned at 2.4.13 in `biome.json`.

## Learnings

- Biome exits 0 on warning-only output — integration/unit tests that assert non-zero exit must trigger at least one ERROR-level rule. Format violations (double quotes vs `quoteStyle: single`, extra semicolons vs `semicolons: asNeeded`) are the most reliable way to force exit 1.
- `noExcessiveCognitiveComplexity`, `noExplicitAny`, `noArrayIndexKey`, and the `a11y` rules in this config are all warn-level — do not use them alone to assert failure.
- Biome's `assist/source/organizeImports` is an ERROR-level check; unsorted `export { x }` after a plain `const` declaration fails `biome check`.

## Files / Surfaces

- Added: `biome.json`, `.githooks/pre-commit`, `vitest.integration.config.ts`, 5 test files under `__tests__/`.
- Modified: `package.json` (+ Biome devDep, + `test:integration` script), `vitest.config.ts` (exclude `*.integration.test.ts`), `__tests__/scaffold.test.ts` (auto-formatted by Biome: single quotes + no semicolons).
- `core.hooksPath` set to `.githooks` by `prepare` script.

## Errors / Corrections

- First attempt at the lint-failure sandbox file used `any` + `unused` variables — these are warnings in this config, so commit succeeded. Switched to format violations (double quotes + trailing semicolons) to produce a hard error.
- Biome auto-formatted pre-existing task_01 files (`vitest.config.ts`, `__tests__/scaffold.test.ts`, tsconfig comments) via `lint:fix`. These stylistic diffs ship with task_02.

## Ready for Next Run

- Task_03 (docs) and all downstream tasks: any new `.ts`/`.tsx`/`.json` files must satisfy `biome check .`. Run `pnpm lint:fix` before staging.
- `pnpm test:integration` is now available for future integration tests (e.g., Feature 002 DB tests). Name files `*.integration.test.ts`.
