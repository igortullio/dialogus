# Task Memory: task_13.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Scaffold `apps/api` workspace package per ADR-004: package.json (Hono 4 + node-server + tsx + pino), tsconfig (extends root, outDir ./dist), `src/infrastructure/http/routes/` folder, placeholder `src/index.ts` that imports `loadConfig`. No `domain/` or `application/` folders. Health route handler + boot wiring deferred to task_14 / task_15.

## Important Decisions

- Placeholder `src/index.ts` uses `void loadConfig` to satisfy `noUnusedLocals` while exporting nothing. Task_15 will replace with real boot code.
- `.gitkeep` lives at `apps/api/src/infrastructure/http/routes/.gitkeep` per task spec subtask 13.3 (transient — replaced when task_14 lands `health.ts`). ADR-004 aversion to empty placeholder folders applies to permanent layout (`domain/`, `application/`); routes folder will hold real code in the very next task.
- `build` script is `tsc --build` per task requirements (other packages use `tsc --noEmit`); apps/api ships a JS bundle in dist/, packages don't.

## Learnings

- `.compozy/runs/*` workflow telemetry (run.json / result.json) lives untracked in the repo and is reformatted between runs — biome was failing the pre-commit hook on these. Added `!**/.compozy` to `biome.json` `files.includes`. The whole `.compozy/` tree (PRDs + ADRs + run telemetry) is untracked, so excluding it from biome is correct: source of truth is the workflow tooling, not biome formatting.
- TS `noUnusedLocals` flags an imported-but-unused symbol; `void loadConfig` is the minimal, side-effect-free way to keep the import as a "wiring proof" without invoking the function (which would crash without env). Pattern is reusable for any future placeholder module.

## Files / Surfaces

- `apps/api/package.json` (new)
- `apps/api/tsconfig.json` (new)
- `apps/api/src/index.ts` (new placeholder)
- `apps/api/src/infrastructure/http/routes/.gitkeep` (new placeholder, replaced by task_14)
- `apps/api/__tests__/scaffold.test.ts` (new structural tests)
- `biome.json` (added `!**/.compozy` exclude — adjacent fix, see Learnings)

## Errors / Corrections

## Ready for Next Run

- Task_14 will replace `apps/api/src/infrastructure/http/routes/.gitkeep` with `health.ts` (route handler factory) and add `apps/api/__tests__/health.test.ts`.
- Task_15 will replace `void loadConfig` placeholder in `apps/api/src/index.ts` with full boot wiring (config → db → hono → routes → serve → graceful shutdown) and add `apps/api/__tests__/boot.test.ts`.
