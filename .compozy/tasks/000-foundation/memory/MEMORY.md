# Workflow Memory

Keep only durable, cross-task context here. Do not duplicate facts that are obvious from the repository, PRD documents, or git history.

## Current State

- Foundation V1 is **closed** (task_21 manual smoke + closure, 2026-04-25). Quickstart succeeds verbatim from a fresh clone; pre-commit ~4.6s; `pnpm build` clean. PRD § Exit Criteria Verification has the measurements.
- Working directory IS a git repo (task_01 initialized it); `core.hooksPath=.githooks` activated by `pnpm install`'s `prepare` script.
- No GitHub remote yet — CI is verified by local-job parity, not by an actual `main` Actions run. First push will flip that.

## Shared Decisions

- Root `test` script is `vitest run && pnpm -r test`. Root-level structural tests live in `__tests__/` (covered by `vitest.config.ts` `include: __tests__/**/*.test.ts`); per-package tests are picked up via `pnpm -r test`. New tasks should add their own per-package `test` scripts rather than modifying root.
- Integration tests use the filename pattern `*.integration.test.ts` and are **excluded** from the default `vitest run` (so they do NOT run in the pre-commit hook). Run them via `pnpm test:integration`, which uses `vitest.integration.config.ts`.
- DB scripts at root use `pnpm --filter @dialogus/db <script>` to dispatch. Task_08 must define the matching `db:generate`, `db:migrate`, `db:studio`, `db:reset` scripts inside `packages/db/package.json`.
- Lint + format is Biome-only; config is `biome.json` at repo root. Pre-commit runs `pnpm lint && pnpm typecheck && pnpm test` with `set -e` semantics.
- Packages that touch `process.env` or other Node globals must add `@types/node` as a package-level devDep AND `"types": ["node"]` in their `tsconfig.json`. There is no root-level `@types/node`; tsc does not auto-discover hoisted types without `types`.
- `envSchema` declares future-feature keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `NEXT_PUBLIC_MASTRA_URL`) as `.optional()` from day 1 so `.env.example` can list every planned var without breaking Foundation validation (per ADR-001).
- **CLI entry points that call `loadConfig()` MUST call `loadEnvFromRoot()` first.** `pnpm`/`tsx` do not auto-load `.env`, and our scripts don't pass `--env-file`. `loadEnvFromRoot()` (in `@dialogus/shared/config`) walks up from cwd and runs `process.loadEnvFile()` on the first `.env` it finds. Already wired into `packages/db/src/migrate.ts` and `apps/api/src/index.ts`; future workers/mastra/CLI scripts must do the same. `apps/web` does not need it (no `loadConfig` call; only env it reads has a default).

## Shared Learnings

- `vitest@^4` and `yaml@^2` are root-level devDeps for structural validation tests; per-package vitest installs are still required by each package task.
- `pnpm -r test` and `pnpm -r typecheck` exit 0 when there are no workspace packages — safe as placeholders until packages exist.
- Biome exits 0 on warning-only output. Rules at `warn` (`noExcessiveCognitiveComplexity`, `noExplicitAny`, `noArrayIndexKey`, a11y rules) will NOT fail the hook. Error-level signals to trigger a deliberate failure: format violations (double quotes, stray semicolons), `organizeImports`, `noVar`.
- Biome auto-fix changes stylistic code across the repo (single quotes, no semicolons, import sorting). Run `pnpm lint:fix` before staging any new TS/JSON files.
- **PG 18 volume mount path: `/var/lib/postgresql` (NOT `/var/lib/postgresql/data`).** PG 18 official images store data in major-version-specific subdirectories under `/var/lib/postgresql`; mounting the legacy `data` path makes the container exit `unhealthy` on first boot. Task_12's migration tooling and any future container-shape change must keep this mount target.
- Integration tests that need Docker should gate with `describe.skipIf(!dockerAvailable)` (probe via `docker info --format '{{.ServerVersion}}'`) so CI environments without Docker (Foundation `ci.yml` is unit-only) don't fail. Use `docker inspect --format '{{.State.Health.Status}}' <id>` for portable health polling rather than parsing `docker compose ps` JSON.
- Drizzle schema shape tests: introspect via `getTableConfig(table)` from `drizzle-orm/pg-core` (yields `name` + `columns[]` with `.name`, `.columnType`, `.notNull`, `.primary`, `.hasDefault`, `.default`); render `sql\`...\`` defaults to strings using `new PgDialect().sqlToQuery(column.default).sql.trim()`. Reference impl: `packages/db/__tests__/schema.test.ts`.
- Tests that call `createDatabase(url)` MUST close the underlying postgres.js client in teardown via `await db.$client.end({ timeout: 0 })`, otherwise vitest hangs on open handles even with an unreachable URL (postgres.js is lazy on connect but still creates timers/sockets on `end` paths). Probe-style unit tests should bypass `createDatabase` entirely and structurally mock `{ execute: vi.fn() }` as `Database`, since probes only touch `db.execute`.
- Pino import under TS6 + bundler resolution: use the named imports `import { pino, stdSerializers } from 'pino'` (NOT `pino.stdSerializers` after a named function import — the named function does not carry the static utils). This applies to any future task adding pino in another package (e.g., `apps/api` boot logging).
- `@dialogus/db` owns its own pino logger at `packages/db/src/logger.ts` rather than depending on `@dialogus/shared`. The migration runner is the only Foundation surface that logs from the db package; promoting to shared can wait until `apps/api` (or another consumer) needs identical config.
- Drizzle 0.45 `db:generate` emits a random tag (e.g. `0000_luxuriant_silver_sable.sql`). To match a stable filename like `0000_init.sql`, rename the SQL file AND update `meta/_journal.json` `entries[].tag` to the same stem (without `.sql`). The journal is what `migrate()` reads to locate files. Use `--> statement-breakpoint` between top-level statements so each runs as its own step.
- `pnpm db:reset` currently aliases to `tsx src/migrate.ts --reset`, but `migrate.ts` ignores the flag — `db:reset` is functionally equivalent to `db:migrate` (idempotent via Drizzle journal + `pgboss.start()`). ADR-002 calls for an actual drop+recreate; if a future feature needs that semantic, add `--reset` handling to `packages/db/src/migrate.ts`.
- `biome.json` excludes `**/.compozy` (entire compozy workflow tree is untracked: tasks/PRDs + runs/telemetry). Future tasks must NOT remove this exclude — `.compozy/runs/*.json` is reformatted between runs and would block the pre-commit hook every cycle.
- Root tsconfig targets `ES2022` (no `lib` override). Code under this baseline must NOT use `Promise.withResolvers` (ES2024). Use the manual `let resolve!; new Promise(r => resolve = r)` pattern in boot/server code that needs an externally-resolvable promise.
- `vi.resetModules()` between vitest tests creates **separate class identities** for re-imported modules. `instanceof ConfigError` (or any `@dialogus/shared/errors` class) fails across the resetModules boundary. For error-type assertions in tests that re-import modules, use structural matchers (`toMatchObject({ name: 'ConfigError', code: '…' })`) instead of `toBeInstanceOf`.
- `envSchema.API_PORT` and `envSchema.WEB_PORT` accept `0` (ephemeral port). The original techspec snippet showed `.min(1)`; task_15 relaxed both to `.min(0)` so unit tests can bind to an OS-assigned port. Production callers fall back to `default(3001)`/`default(3000)` when the var is absent.
- `apps/web` (Next 16) tsconfig sets `jsx: 'preserve'` (Next requires it), which makes Vite's import-analysis reject raw JSX in vitest runs. Fix: add `@vitejs/plugin-react` as devDep and `plugins: [react()]` to `apps/web/vitest.config.ts`. Setting `esbuild.jsx: 'automatic'` alone does NOT work because import-analysis runs before esbuild. Any future Next/JSX package must follow the same pattern.
- `next build` auto-generates `apps/web/next-env.d.ts` at package root; this file is gitignored (root `.gitignore` `next-env.d.ts`) AND excluded from Biome (`!**/next-env.d.ts` in `biome.json` files.includes). Don't remove either entry — Biome would reformat the file on each build and break pre-commit.
- Async React Server Components are testable in vitest+jsdom by calling `await Page()` to get a resolved JSX element, then passing it to `@testing-library/react`'s `render()`. No `Suspense` boundary needed for a single top-level component. Pair with `vi.mock('<module>', () => ({ fn: vi.fn() }))` + top-level `await import(...)` and `vi.mocked(fn)` for a typed mock handle without stubbing globals — Feature 004 chat-UI tasks should follow this pattern.
- Vitest tests that reassign `process.env = { ... }` (in `beforeEach`/`afterEach`) decouple the JS reference from the C++ env binding. After reassignment, `process.loadEnvFile()` writes to the binding, but reads via the reassigned object miss those writes. Tests for `loadEnvFromRoot` (and any future env-mutating helper) must mutate `process.env` per-key (`delete`/`set` + restore) rather than reassigning. Reference impl: `packages/shared/__tests__/loadEnv.test.ts`.

## Open Risks

- TypeScript 6 baseline: not yet validated against Drizzle / Hono / Next 16 / `@mastra/*` peers. If a peer rejects TS 6, fall back to `~5.9` (per PRD risk).

## Handoffs

- Feature 001 (catalog) PRD authoring is unblocked. Foundation extension points: new domain tables go through `drizzle-kit generate` + a new SQL file under `packages/db/drizzle/`; new HTTP routes go under `apps/api/src/infrastructure/http/routes/` and mount in `apps/api/src/index.ts`; new shared types/schemas live in `@dialogus/shared`.
- User must `git remote add origin <url> && git push -u origin main` for CI to actually run on `main`. PRD exit-criteria annotation flags this as `⚠️ Local-only`.
- Future integration tests (starting Feature 002 DB work) must use `*.integration.test.ts` naming and `pnpm test:integration` runner.
