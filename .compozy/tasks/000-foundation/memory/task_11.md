# Task Memory: task_11.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Implement `createPgBoss` factory + `runMigrations` orchestration in `@dialogus/db` per ADR-003 (single-ceremony Drizzle migrate → pg-boss start/stop).

## Important Decisions

- Pino lives at `packages/db/src/logger.ts` (not promoted to `@dialogus/shared`). Keeps task scope tight; future tasks can promote to shared if other packages need a logger.
- `@vitest/coverage-v8` added as `@dialogus/db` devDep so coverage assertions can be run on demand (no global root install — task-local).
- Pino configured with `serializers: { error: stdSerializers.err }` so the `error` field in stage logs is meaningfully serialized (with stack/message). Without this, errors stringify as `{}`.
- Pure helper `isCliEntry(metaUrl, argv)` exported and unit-tested directly; the actual CLI invocation block (`if (isCliEntry(...))`) is wrapped in `/* v8 ignore start/stop */` since it depends on process.argv state we cannot fake without subprocess execution.

## Learnings

- Pino's static `stdSerializers` is NOT accessible via the named function import `import { pino }` — must be imported separately via `import { pino, stdSerializers } from 'pino'`. The default `import pino from 'pino'` would expose `pino.stdSerializers`, but TS6 with `esModuleInterop` plus pino's `export = pino` shape needs the named import path under bundler resolution.
- `vi.hoisted` is required to share `vi.fn()` instances between mock factories (`vi.mock`'s factory) and the test body when the assertions need to inspect call counts. `vi.mock` factories run before module-scope code.
- `drizzle-orm/postgres-js/migrator#migrate` requires `meta/_journal.json` inside the migrationsFolder — confirmed on smoke run with empty drizzle/. This is task_12's deliverable; expected to fail today.

## Files / Surfaces

- `packages/db/src/pgboss.ts` — implements `createPgBoss`.
- `packages/db/src/migrate.ts` — implements `runMigrations` + CLI entry + `isCliEntry`.
- `packages/db/src/logger.ts` — new pino logger shared internally by db package.
- `packages/db/src/index.ts` — re-exports `createPgBoss`, `runMigrations`, `PgBoss` type.
- `packages/db/__tests__/migrate.test.ts` — runMigrations + isCliEntry unit tests (10 cases).
- `packages/db/__tests__/pgboss.test.ts` — createPgBoss tests (kept separate so the migrate-test pg-boss mock does not pollute).
- `packages/db/package.json` — adds `pino@^9.0.0` runtime dep + `@vitest/coverage-v8@^4.0.0` dev dep.

## Errors / Corrections

- (none)

## Ready for Next Run

- task_12 may proceed: `pnpm db:generate` will write `drizzle/0000_init.sql`; once committed with extensions+seed, `pnpm db:migrate` end-to-end smoke against docker-compose Postgres should pass without further code change.
