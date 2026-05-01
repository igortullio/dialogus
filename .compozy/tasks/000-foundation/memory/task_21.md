# Task Memory: task_21.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Manual smoke against a fresh clone, annotate `_prd.md` with measured exit-criteria evidence, and close Foundation V1.

## Important Decisions

- Scope expanded by one strictly-necessary fix: smoke caught that `.env` is never loaded, blocking the verbatim README quickstart at `pnpm db:migrate`. Fixed via `loadEnvFromRoot()` in `@dialogus/shared/config` (Node 22 `process.loadEnvFile()` + walk-up search) wired into `packages/db/src/migrate.ts` and `apps/api/src/index.ts`. Without this, no version of the manual smoke could have passed.
- `apps/web` deliberately NOT updated to call `loadEnvFromRoot()` — it never imports `loadConfig` and its only env var (`NEXT_PUBLIC_API_URL`) has a runtime default. Adding it would be dead code.
- CI green-on-main is verified via local-job parity (lint + typecheck + test + build run clean against `HEAD`) because the repo has no GitHub remote yet. PRD annotation flags this as `⚠️ Local-only` rather than overclaiming.

## Learnings

- `process.env` reassignment in vitest tests (`process.env = { ... }` in `afterEach`) decouples the JS reference from the C++ env binding. After reassignment, `process.loadEnvFile()` writes to the binding but the reassigned object never sees it. The new `loadEnv.test.ts` mutates per-key (delete in setup/teardown) instead of reassigning `process.env`, and it works.
- `pnpm` does NOT auto-load `.env` (was removed years ago). `tsx` does NOT auto-load `.env` either — `--env-file` is a Node flag and tsx 4.19 forwards it, but our scripts didn't pass it. `process.loadEnvFile()` (Node 22 stable) is the cleanest in-process fix.
- Setup time on a warm pnpm store: ~39s end-to-end (clone → install → docker → migrate → first landing render). Postgres healthcheck is the dominant cost (~22s of that). Cold-store install would add seconds, not minutes — comfortably under the 15-min target.

## Files / Surfaces

- `packages/shared/src/config/index.ts` — added `loadEnvFromRoot()`.
- `packages/shared/__tests__/loadEnv.test.ts` — new (2 tests).
- `packages/db/src/migrate.ts` — calls `loadEnvFromRoot()` in CLI entry block.
- `apps/api/src/index.ts` — calls `loadEnvFromRoot()` in `main()`.
- `__tests__/foundation-closure.test.ts` — new (5 tests: structural PRD annotation check + measurement bounds).
- `.compozy/tasks/000-foundation/_prd.md` — appended `## Exit Criteria Verification` block at bottom.

## Errors / Corrections

- First fresh-clone attempt failed at `pnpm db:migrate` with `DATABASE_URL: undefined`. Root cause: README had `cp .env.example .env` step but no env-loading mechanism. Fix above resolved it; second attempt succeeded verbatim.
- `loadEnv.test.ts` initially reassigned `process.env` in `beforeEach`; `process.loadEnvFile()` then wrote to the binding but the test re-read from the now-disconnected JS object. Switched to per-key delete/restore.

## Ready for Next Run

Foundation V1 is closed. Feature 001 (catalog) PRD authoring is unblocked. The user can configure a GitHub remote and push `main` to flip CI from "local-only" to "actually green on main".
