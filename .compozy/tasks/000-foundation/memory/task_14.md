# Task Memory: task_14.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Implement `/health` Hono sub-app factory at `apps/api/src/infrastructure/http/routes/health.ts` and unit tests at `apps/api/__tests__/health.test.ts`.

## Important Decisions

- Returned a `Hono` sub-app (not a bare handler) because task_15 mounts via `app.route('/health', createHealthRoute({ db }))` per ADR-004 implementation notes — the sub-app handler binds to `/` so the parent `/health` mount makes the URL exact.
- Validate via `healthResponseSchema.parse` before `c.json` rather than typing the literal — this catches accidental shape regressions if the schema gains a field later.
- Removed the placeholder `.gitkeep` from `src/infrastructure/http/routes/` now that the directory has real content.

## Learnings

- Hono sub-apps are testable with `app.request('/', { method: 'GET' })` returning a fetch `Response` — no need for a real listener; lets us assert status, body, and Content-Type purely in-process.
- `vi.hoisted` is required when sharing mock fns between `vi.mock(...)` and the test body, since `vi.mock` is hoisted above imports.

## Files / Surfaces

- `apps/api/src/infrastructure/http/routes/health.ts` (new — factory)
- `apps/api/src/infrastructure/http/routes/.gitkeep` (deleted)
- `apps/api/__tests__/health.test.ts` (new — 6 tests)

## Errors / Corrections

## Ready for Next Run

- task_15 can mount the route with `app.route('/health', createHealthRoute({ db }))`. The factory signature is `(deps: { db: Database }): Hono`.
