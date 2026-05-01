---
name: task_15 memory
description: Task-local notes for apps/api pg-boss runtime client + cleanup job wiring
type: project
---

# Task Memory: task_15.md

## Objective Snapshot

- Extend `apps/api/src/index.ts` boot to: start runtime pg-boss, register request-id + problem middlewares globally, expose a `routes` option for catalog/library mounts (deferred to tasks 13/14), schedule + work the hourly `catalog.cleanup-idempotency-keys` job, and stop pg-boss before db client on shutdown.

## Important Decisions

- pg-boss runtime client lives **only in apps/api boot** (per task spec). Foundation ADR-003 still owns schema migration; runtime `boss.start()` is idempotent and does not contradict that ADR.
- Boot exposes `routes?: ReadonlyArray<{ prefix: string; app: Hono }>` so tasks 13/14 can wire catalog/library route factories without re-touching `start()`. Task_15's own `main()` does not auto-mount catalog/library — those tasks will update `main()` to import their factories. This avoids fake imports of route files that don't exist yet.
- Re-exported `Job` and `WorkHandler` types from `@dialogus/db/pgboss` so consumers don't need a direct `pg-boss` dep. Apps/api keeps its dep-list closed (it does NOT add `pg-boss` to its package.json).
- Queue creation is guarded by `getQueue` first — `boss.createQueue` is not idempotent in pg-boss 12 and would throw on a re-run.

## Learnings

- pg-boss 12 requires `createQueue(name)` before `schedule()` / `work()`. `boss.getQueue(name)` returns the queue or null; using it as the "exists?" probe avoids try/catch noise.
- `boss.stop({ graceful: false })` exits without waiting for in-flight workers — chosen for the boot smoke test, where we have no real jobs running. Production may want a graceful stop, but this task only schedules a cleanup job that runs hourly so a non-graceful stop is fine.
- Vitest v8 coverage's text-table output omits files at 100% from the per-file rows but they ARE included in the aggregate (verified via `--coverage.reporter=json-summary`). The new files (`request-id.ts`, `jobs/cleanup-idempotency-keys.ts`) sit at 100% and contribute to the 93.84% statement aggregate.

## Files / Surfaces

- `apps/api/src/index.ts` — full boot module rewrite (pg-boss, request-id, problem, route mounts, cleanup job registration, shutdown order: boss.stop → server.close → db.$client.end).
- `apps/api/src/infrastructure/http/middleware/request-id.ts` — new; reads `x-trace-id` request header (falls back to `randomUUID`), sets `c.set('traceId', ...)` and echoes back in response header.
- `apps/api/src/jobs/cleanup-idempotency-keys.ts` — new; exports `runCleanupIdempotencyKeys`, `createCleanupIdempotencyKeysHandler`, `CLEANUP_IDEMPOTENCY_KEYS_JOB`, `CLEANUP_IDEMPOTENCY_KEYS_CRON`. Uses Drizzle `db.delete(idempotencyKeys).where(lt(...)).returning({ key })` for testability.
- `apps/api/__tests__/boot.test.ts` — extended with pg-boss mock (createPgBoss, start/stop/getQueue/createQueue/schedule/work spies), route mount via `routes` option, request-id header echo + preservation, problem middleware integration through mounted route, schedule job assertion.
- `apps/api/__tests__/jobs/cleanup-idempotency-keys.test.ts` — new; covers row-count return, 0-row case, optional logger, handler factory.
- `packages/db/src/pgboss.ts` — added `Job` + `WorkHandler` type re-exports.

## Errors / Corrections

- Initial cleanup job imported `Job` from `pg-boss` directly; TS could not resolve it because `pg-boss` is not a direct apps/api dep. Fixed by re-exporting through `@dialogus/db/pgboss`.

## Ready for Next Run

- Task 13 (catalog routes) and task 14 (library routes) need to update `main()` in `apps/api/src/index.ts` to construct their route factories and pass them via the `routes` option of `start()`. Wiring point is the `for (const mount of options.routes ?? [])` loop — extend the production composition, not the option API.
- The hourly cleanup is registered automatically on every boot (after queue ensure). Smoke test for closure (task_18) should assert one log line containing `idempotency keys cleanup complete` after a forced job run.
