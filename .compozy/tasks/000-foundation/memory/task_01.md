# Task Memory: task_01.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Bootstrap monorepo root: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `.nvmrc`, `.gitignore` plus structural validation tests.

## Important Decisions

- Root `test` script set to `vitest run && pnpm -r test`. Reason: task requires structural unit tests with ≥80% coverage of manifest files; root tests live in `__tests__/`, package tests are recursed via `pnpm -r`. Subsequent tasks add packages without modifying this script (their own `test` scripts plug into the recursive call).
- Installed `vitest@^4` and `yaml@^2` at the repo root to support root-level structural tests. These are root-only devDeps; per-package vitest installations come with each package task.
- `.nvmrc` pinned to `22.13` (PRD requirement) rather than m5nita's bare `22`.
- DB scripts (`db:generate`, `db:migrate`, `db:studio`, `db:reset`) dispatch to `@dialogus/db` via `pnpm --filter @dialogus/db <script>`. Filter resolves to a no-op until task_08 scaffolds the package.

## Learnings

- `pnpm -r test` and `pnpm -r typecheck` exit 0 when no workspace packages are present ("No projects matched the filters"). Safe as a placeholder until later tasks add packages.
- `prepare` script `git config core.hooksPath .githooks || true` is robust to running outside a git directory (prints "fatal: not in a git directory" but exits 0 due to `|| true`).
- The dialogus working directory is NOT yet a git repository at task_01 start — auto-commit step needs to handle initialization.

## Files / Surfaces

- `/Users/igortullio/Developer/igortullio/dialogus/package.json` (new)
- `/Users/igortullio/Developer/igortullio/dialogus/pnpm-workspace.yaml` (new)
- `/Users/igortullio/Developer/igortullio/dialogus/tsconfig.json` (new)
- `/Users/igortullio/Developer/igortullio/dialogus/.nvmrc` (new)
- `/Users/igortullio/Developer/igortullio/dialogus/.gitignore` (new)
- `/Users/igortullio/Developer/igortullio/dialogus/vitest.config.ts` (new — scopes root tests to `__tests__/**`)
- `/Users/igortullio/Developer/igortullio/dialogus/__tests__/scaffold.test.ts` (new — 10 structural assertions)

## Errors / Corrections

None.

## Ready for Next Run

- Task 02 (Biome + pre-commit hook) can layer biome.json and `.githooks/pre-commit` on top of existing root.
- Task 05+ packages should add their own vitest configs and `test` scripts; root `pnpm -r test` will pick them up automatically.
