# Task Memory: task_08.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Scaffold `@dialogus/db` workspace package with deps + scripts + empty barrel stubs. No real DB code (deferred to tasks 09-12).

## Important Decisions

- `db:reset` wired as `tsx src/migrate.ts --reset` (single-script pattern from dialogus-2 reference). Avoids creating an out-of-spec `scripts/reset.ts`. The `--reset` flag handler is implementation work for task_11 / task_12.
- `drizzle.config.ts` reads `process.env.DATABASE_URL` directly with a fail-fast throw — drizzle-kit is build-time tooling, the "only @dialogus/shared reads env" rule is runtime-only.
- Stubs are `export {}` (not `export const _ = null`) — keeps barrels truly empty and lets task_09/10/11 replace them outright.

## Learnings

- `pnpm install` after adding a workspace package surfaces a benign peer warning (vite 8 → esbuild ^0.27, vitest 4 brings 0.19). Doesn't break test runs; ignore unless tests fail.
- `pnpm --filter @dialogus/db exec drizzle-kit --help` exits 0 once the package devDep is installed — useful smoke for follow-up tasks.

## Files / Surfaces

- `packages/db/package.json` (new)
- `packages/db/tsconfig.json` (new) — extends root, `types: ['node']` per repo convention
- `packages/db/drizzle.config.ts` (new)
- `packages/db/src/{index,client,probes,pgboss,migrate}.ts` + `src/schema/index.ts` (new stubs)
- `packages/db/__tests__/scaffold.test.ts` (new, 14 tests)

## Errors / Corrections

- Initially wrote `db:reset` as `tsx scripts/reset.ts && pnpm db:migrate`; corrected to `tsx src/migrate.ts --reset` to stay within the spec'd file list.

## Ready for Next Run

- Task 09 can replace `src/schema/index.ts` + add `src/schema/system_health.ts`; the barrel test in scaffold.test.ts will keep passing.
- Task 10 can implement `createDatabase` in `src/client.ts` and `probeDb`/`probePgBoss` in `src/probes.ts`.
- Task 11 must implement the `--reset` handler in `src/migrate.ts` (or split into a sibling file) so `db:reset` works against the docker-compose Postgres before task_12 smoke.
