# Task Memory: task_12.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Generate the initial Drizzle migration, hand-edit it to prepend `CREATE EXTENSION` statements (`vector`, `uuid-ossp`) and append the `system_health` seed row, then verify the full `pnpm db:migrate` cycle on docker-compose Postgres.

## Important Decisions

- Renamed Drizzle's auto-generated `0000_luxuriant_silver_sable.sql` -> `0000_init.sql` and updated `meta/_journal.json` `tag` to `0000_init` to match the task spec filename. Drizzle locates SQL via the journal `tag`, so the rename + tag update keep `migrate()` working.
- Used Drizzle's `--> statement-breakpoint` separator between every top-level statement in `0000_init.sql` so the runner executes extensions and DDL as discrete statements.
- Combined task subtasks 12.2 + 12.4 into a single commit (auto-commit policy = one commit per task). The hand-edited contents of `0000_init.sql` are visible in the same diff as the journal/snapshot files.

## Learnings

- Drizzle 0.45's `meta/_journal.json` and `meta/0000_snapshot.json` are mandatory companions to the SQL file — `runMigrations` reads the journal to find migrations.
- Reusing the dev compose container for an integration test conflicts with `__tests__/docker-compose.integration.test.ts` (host port 5432). The pre-existing test assumes dev compose is DOWN. Solution applied here: gate the new test on `docker inspect dialogus-postgres-1 -> Running == true` so it skips when dev compose is down (where the conflicting test takes over) and runs when dev compose is up.
- `pnpm db:reset` currently aliases to `tsx src/migrate.ts --reset` but `migrate.ts` ignores the `--reset` flag — running `db:reset` is functionally identical to `db:migrate`. Idempotent thanks to Drizzle journal + `pgboss.start()` so it still exits 0. See follow-up.

## Files / Surfaces

- `packages/db/drizzle/0000_init.sql` (new — generated then hand-edited).
- `packages/db/drizzle/meta/_journal.json` (new — tag renamed to `0000_init`).
- `packages/db/drizzle/meta/0000_snapshot.json` (new — Drizzle metadata).
- `packages/db/__tests__/migration-sql.test.ts` (new — structural SQL contents check).
- `__tests__/db-migrate.integration.test.ts` (new — full migrate cycle vs dev compose).

## Errors / Corrections

- None during execution. One pre-existing limitation surfaced (port-5432 conflict in `docker-compose.integration.test.ts`) — handled by container-running gate on the new test.

## Ready for Next Run

- Migration file is in place; downstream tasks (13-15 for apps/api, 20 for README) can rely on `pnpm db:migrate` producing `system_health` + extensions + `pgboss` schema.
- If a future task wants `db:reset` to actually drop+recreate the DB (per ADR-002 Implementation Notes), it needs to add `--reset` handling to `packages/db/src/migrate.ts` (or a sibling script) that drops+creates via psql/postgres.js before invoking `runMigrations`.
