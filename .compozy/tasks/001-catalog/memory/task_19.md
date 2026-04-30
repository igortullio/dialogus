# Task Memory: task_19.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Add CORS middleware to `apps/api` so browser fetches from `apps/web` (localhost:3000) are not blocked by preflight failures.

## Important Decisions

- Used `hono/cors` (built into Hono 4.x, no new dep needed).
- `WEB_ORIGIN` added to `@dialogus/shared/config/index.ts` with default `http://localhost:3000`; consumed in `start()` as `config.WEB_ORIGIN`.
- CORS middleware mounted as the very first `app.use('*', ...)` in `start()` — before `requestId`, `problem`, and route mounts. This ensures preflight OPTIONS is answered before any route logic runs.
- `allowMethods`: GET, POST, PUT, PATCH, DELETE, OPTIONS.
- `allowHeaders`: Content-Type, Idempotency-Key, Authorization.
- `maxAge`: 600 (10 min preflight cache).
- Single string origin (not `*`) to stay forward-compatible with credentials.

## Learnings

- CORS integration tests don't require Testcontainers — they test middleware behavior via `app.request()` directly on a stub Hono app.
- `library.integration.test.ts` fails with Docker socket unavailability in this environment (pre-existing; `describe.skipIf(!dockerAvailable)` guard doesn't fully prevent Testcontainers from trying to start).

## Files / Surfaces

- `packages/shared/src/config/index.ts` — added `WEB_ORIGIN: z.string().url().default('http://localhost:3000')`
- `.env.example` — added `WEB_ORIGIN=http://localhost:3000` with feature tag
- `apps/api/src/index.ts` — imported `cors` from `hono/cors`; mounted before `requestId` and `problem`
- `apps/api/__tests__/integration/cors.integration.test.ts` — new; 4 tests all pass

## Errors / Corrections

None.

## Ready for Next Run

Task complete. All deliverables shipped:
- `cors()` mounted globally, config-driven origin.
- `WEB_ORIGIN` declared in shared config with `.env.example` entry.
- 4 integration tests: preflight 204, GET 200 + header, evil origin rejected, /health smoke.
