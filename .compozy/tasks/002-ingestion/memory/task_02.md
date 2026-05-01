# Task Memory: task_02.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

apps/worker scaffold landed. Catalog cleanup handler migrated from `apps/api/src/jobs/` to `apps/worker/src/handlers/`. apps/api boot no longer calls `boss.start/schedule/work`; transient enqueue helper added at `apps/api/src/infrastructure/pgboss/enqueue.ts`. Ingestion stage handler registration in worker is left for task_15.

## Important Decisions

- Worker boot mirrors apps/api boot module shape (loadConfig → createDatabase → createPgBoss → start → register → SIGTERM handler) so future ingestion handler registration in task_15 has a familiar surface.
- `enqueue` helper takes `EnqueueDeps { databaseUrl, createBoss? }` instead of reading config directly, so route handlers stay testable without env mocking.
- Helper throws `EnqueueError` when `boss.send` returns `null` (singleton/throttle conflict), rather than silently propagating null jobId — keeps the public return type `Promise<string>`.
- Root `pnpm dev` switched from blanket `pnpm --parallel -r dev` to an explicit `--filter @dialogus/api --filter @dialogus/worker --filter @dialogus/web` list. Explicit list documents the three runtime processes and keeps any future test-only or script-only packages out of `dev`.

## Learnings

- pg-boss `send(name, data)` signature is `Promise<string | null>` (verified in pg-boss@12.17.0 `dist/index.d.ts`). Null is rare but possible; route helpers must handle it.
- The worker has no tsconfig.json `references` array — apps don't share project-references with packages in this monorepo. Workspace deps are resolved via `pnpm`'s symlinks + the package.json `main` pointing at `./src/index.ts`.

## Files / Surfaces

- `apps/worker/{package.json,tsconfig.json,src/index.ts,src/handlers/catalog-cleanup-idempotency-keys.ts}` (new)
- `apps/worker/__tests__/{boot.test.ts,handlers/catalog-cleanup-idempotency-keys.test.ts}` (new)
- `apps/api/src/infrastructure/pgboss/enqueue.ts` (new)
- `apps/api/__tests__/infrastructure/pgboss/enqueue.test.ts` (new)
- `apps/api/src/index.ts` (modified — pg-boss boot wiring removed; `boss` removed from `BootResult`)
- `apps/api/__tests__/boot.test.ts` (modified — boss-related assertions removed; "does not start a long-running pg-boss instance at boot" added)
- `apps/api/src/jobs/cleanup-idempotency-keys.ts` (deleted)
- `apps/api/__tests__/jobs/cleanup-idempotency-keys.test.ts` (deleted)
- `package.json` (root `dev` script)
- `README.md` (Architecture section now describes three runtime processes + the api/worker split)
- `.compozy/tasks/001-catalog/task_15.md` (header supersede note added)

## Errors / Corrections

- None.

## Ready for Next Run

- task_15 (this feature) needs to register ingestion stage handlers in the existing `apps/worker/src/index.ts` boot. The cleanup-handler registration there is the template — it ensures the queue exists, then schedules + works it. Each ingestion handler will follow the same pattern with `teamConcurrency: 1` per ADR-002.
- task_14 (library routes) should import `enqueue` from `apps/api/src/infrastructure/pgboss/enqueue.ts` and pass `{ databaseUrl: config.DATABASE_URL }` per request handler.
