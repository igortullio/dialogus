# Task Memory: task_09.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Drizzle `system_health` canary table defined in `packages/db/src/schema/system_health.ts`, re-exported as `systemHealth` from the schema barrel, with shape-asserting unit tests. No seed data (task_12 owns seeding).

## Important Decisions

- JS field name `createdAt` (camelCase) maps to DB column `created_at`, matching the m5nita `pool` reference. Tests look up columns by DB name via `getTableConfig(...).columns[i].name` so the JS-vs-DB casing distinction is asserted, not assumed.
- `id` default uses `sql\`uuid_generate_v4()\`` (not `$defaultFn(crypto.randomUUID)`) because ADR-002 requires the SQL migration to call the DB-side `uuid-ossp` extension function — `crypto.randomUUID()` would emit a NULL default in the generated SQL.

## Learnings

- `drizzle-orm@0.45` exposes column metadata via `getTableConfig(table)` (from `drizzle-orm/pg-core`), returning `{ name, columns, indexes, ... }`. Each column has `.name`, `.columnType`, `.notNull`, `.primary`, `.hasDefault`, `.default` (raw value or `SQL` instance).
- To render a SQL-template default (e.g., `sql\`now()\``) to a string in a test, instantiate `new PgDialect()` and call `.sqlToQuery(column.default).sql.trim()` — emits `now()` / `uuid_generate_v4()` exactly.
- `noUncheckedIndexedAccess: true` (root tsconfig) makes `Object.fromEntries(...)[key]` return `T | undefined`. Use a `Map` + helper that throws on missing key to stay strict-clean in test code.
- Smoke-checked `pnpm db:generate` with a dummy `DATABASE_URL`; output matches the techspec verbatim. Generated `drizzle/` dir was deleted — task_12 owns committing the migration.

## Files / Surfaces

- `packages/db/src/schema/system_health.ts` (new) — table definition.
- `packages/db/src/schema/index.ts` (modified) — re-exports `systemHealth`.
- `packages/db/__tests__/schema.test.ts` (new) — 6 tests covering table name, column set, and per-column shape + defaults.

## Errors / Corrections

- First test draft used `Object.fromEntries(...)[key]` lookups; tripped `noUncheckedIndexedAccess`. Switched to `Map` + `getColumn()` helper.
- Biome `organizeImports` reordered `{ PgDialect, getTableConfig }` → `{ getTableConfig, PgDialect }`; applied manually instead of via `lint:fix`.

## Ready for Next Run

- Task_10 (`createDatabase` + probes) can import `systemHealth` from `@dialogus/db/schema` to wire the drizzle client's `schema` option.
- Task_12 (initial migration) should run `pnpm db:generate` and commit the resulting `drizzle/0000_*.sql`, then hand-edit only the prologue to prepend `CREATE EXTENSION IF NOT EXISTS vector;` + `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";` and append the seed `INSERT`.
