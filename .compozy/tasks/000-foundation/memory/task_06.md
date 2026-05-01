# Task Memory: task_06.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Implement `envSchema`, `DialogusEnv`, and `loadConfig()` in `@dialogus/shared/config`. `loadConfig()` must throw `ConfigError` with a grouped message listing every invalid field on validation failure.

## Important Decisions

- **Minimal `ConfigError` landed early in this task.** Task_06 declares `loadConfig` MUST throw `ConfigError` from `@dialogus/shared/errors`, but `ConfigError` is task_07's deliverable. Wrote a minimal `DialogusError` + `ConfigError` here (signature matches techspec) so task_06 compiles. Task_07 still owns the full hierarchy (`NotFoundError`, `ValidationError`) + dedicated tests; treat task_07's edit as additive, not as rewriting these classes.
- **Future-feature env keys declared as `.optional()` in `envSchema` from day 1** (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `NEXT_PUBLIC_MASTRA_URL`). Lets `.env.example` stay complete (per ADR-001) without breaking Foundation validation. Required by task spec.
- **Grouped error format**: `Invalid environment configuration:\n- FIELD: message\n- FIELD: message`. Single string in `ConfigError.message`; underlying `ZodError` preserved as `cause`. Tests assert specific field names appear in the message rather than exact format.
- **`loadConfig` uses `safeParse` not `parse`** so the throw site is explicit and the ZodError can be attached as `cause`.

## Learnings

- Vitest 4 sets `NODE_ENV=test` automatically. Tests asserting `loadConfig` defaults must clear `NODE_ENV` from `process.env` (not just rely on a saved snapshot, because the snapshot already contains `NODE_ENV=test`).
- `@types/node` is NOT installed at the workspace root. Adding `process.env` to a package required adding `@types/node` as a package-level devDep + `"types": ["node"]` in that package's `tsconfig.json`. Without `types: ["node"]`, tsc didn't auto-discover the locally hoisted types.
- zod 4.3.6 still accepts `z.string().url()` (the older API). The new `z.url()` shorthand also exists in v4 but mixing both is fine — kept `.url()` for parity with the techspec snippet.
- Biome's `organizeImports` reorders import order alphabetically by source; vitest must come after package imports. Run `pnpm lint:fix` before staging.

## Files / Surfaces

- `packages/shared/src/config/index.ts` — `envSchema`, `DialogusEnv`, `loadConfig`.
- `packages/shared/src/errors/index.ts` — minimal `DialogusError` + `ConfigError` (task_07 will add the rest).
- `packages/shared/src/index.ts` — barrel re-exports both modules.
- `packages/shared/__tests__/config.test.ts` — 9 unit tests (1 schema + 8 loadConfig).
- `packages/shared/package.json` — added `@types/node` devDep.
- `packages/shared/tsconfig.json` — added `"types": ["node"]`.

## Errors / Corrections

- First test run: happy-path test expected `NODE_ENV='development'` default but got `'test'`. Fix: tests build a sanitized env with all dialogus keys deleted before each call instead of merging over the original `process.env`.
- Initial typecheck failed because `process` was undefined. Fix: added `@types/node` devDep + explicit `types: ["node"]` to package tsconfig.

## Ready for Next Run

- task_07 must EXTEND `packages/shared/src/errors/index.ts` (add `NotFoundError`, `ValidationError`) — do NOT rewrite the existing `DialogusError` / `ConfigError` classes; task_06's tests depend on them.
- task_07's barrel work is partially done (`src/index.ts` already re-exports `./errors`). It still must add `./schemas/health` to the barrel.
