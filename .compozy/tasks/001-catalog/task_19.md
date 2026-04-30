---
status: completed
title: apps/api CORS middleware for cross-origin web → api requests
type: backend
complexity: low
dependencies:
    - task_14
---

# Task 19: apps/api CORS middleware for cross-origin web → api requests

## Overview

The browser running `apps/web` on `http://localhost:3000` calls `apps/api` on `http://localhost:3001` (and the same port pair in any deployment topology that crosses origins). Without a CORS middleware on Hono, every browser fetch fails the preflight with `No 'Access-Control-Allow-Origin' header is present on the requested resource`. The library page (`/library`) and the landing's `fetchLibraryCountByStatus()` are the user-visible casualties — but every `apps/web` cross-origin call to the API is blocked the same way.

Add a `cors()` middleware to the Hono app in `apps/api/src/index.ts` so that the web origin is allowed in dev and an explicit allowlist is enforced in production.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add `hono/cors` middleware mounted on `*` in `apps/api/src/index.ts` BEFORE the existing route mounts (so preflights are answered before route resolution).
- MUST set the allowed origin from a config value rather than hardcoding it. Read `WEB_ORIGIN` (or equivalent env-derived value) from `loadConfig()` so dev defaults to `http://localhost:3000` and prod can be tightened. If the env var is not yet declared in `@dialogus/shared/config`, add it there with a reasonable default and update `.env.example`.
- MUST allow methods: `GET, POST, PUT, PATCH, DELETE, OPTIONS`.
- MUST allow headers: `Content-Type, Idempotency-Key, Authorization`.
- MUST set `maxAge` to keep preflight cache reasonable (e.g. 600s).
- MUST NOT use `origin: '*'` when `Access-Control-Allow-Credentials` could ever be true. If credentials are not used today, an explicit single origin (config-driven) is preferred over `*` so the change is forward-compatible.
- MUST cover the middleware via integration tests that issue an `OPTIONS` preflight from a non-origin and assert the response headers.

</requirements>

## Subtasks

- [x] 19.1 Add `WEB_ORIGIN` env var to `@dialogus/shared/config` with default `http://localhost:3000`; update `.env.example`.
- [x] 19.2 Mount `cors()` middleware in `apps/api/src/index.ts` (in `start()`), before `requestId`, `problem`, and route mounts.
- [x] 19.3 Verify boot order: cors → requestId → problem → routes.
- [x] 19.4 Integration test: `OPTIONS /api/library/books` with `Origin: http://localhost:3000` returns `Access-Control-Allow-Origin` header matching that origin.
- [x] 19.5 Integration test: `GET /api/library/books` with `Origin: http://localhost:3000` returns 200 + `Access-Control-Allow-Origin` header.
- [x] 19.6 Integration test: same `GET` with `Origin: http://evil.example` does NOT echo that origin back (or returns the configured allowed origin instead).

## Implementation Details

CORS belongs to the API boot module so it covers every route uniformly. It's not a route concern. The order matters because Hono evaluates middlewares top-down: the preflight `OPTIONS` request must be answered by `cors()` before any route-specific logic runs.

The `WEB_ORIGIN` value is the canonical place to read the allowed origin; it can later be extended to an array of origins if multiple frontends call the API.

### Relevant Files

- `apps/api/src/index.ts` (mount middleware here, in `start()`)
- `packages/shared/src/config/index.ts` (add `WEB_ORIGIN`)
- `.env.example` (document the new var)

### Dependent Files

- `apps/api/__tests__/integration/cors.integration.test.ts` (new — preflight + actual request)

### Related ADRs

- None directly. Related to ADR-002 (envelope / API contract surface) only insofar as the same surface is being exposed cross-origin.

## Deliverables

- `cors()` middleware live on every API route, including `/health`, `/api/library/*`, `/api/catalog/*`.
- `WEB_ORIGIN` env var declared, documented, and consumed.
- Integration test suite covering preflight + actual request **(REQUIRED)**.
- Manual verification: with the dev stack running (`pnpm run dev`), opening `http://localhost:3000/library` in a browser must not produce any CORS errors in the console.

## Tests

- Integration tests (`cors.integration.test.ts`):
  - [ ] `OPTIONS /api/library/books` with `Origin: http://localhost:3000`, `Access-Control-Request-Method: GET`, `Access-Control-Request-Headers: content-type` → 204 with `Access-Control-Allow-Origin: http://localhost:3000`, `Access-Control-Allow-Methods` including `GET`, `Access-Control-Allow-Headers` including `Content-Type`, `Access-Control-Max-Age: 600`.
  - [ ] `GET /api/library/books` with `Origin: http://localhost:3000` → 200 + `Access-Control-Allow-Origin: http://localhost:3000`.
  - [ ] `GET /api/library/books` with `Origin: http://evil.example` → either no `Access-Control-Allow-Origin` header echoing that origin OR the allowed origin returned (browser will block; assertion is server-side response shape).
  - [ ] Health endpoint: `GET /health` with `Origin: http://localhost:3000` → 200 + correct CORS header (smoke that middleware is mounted globally).
- All tests must pass

## Success Criteria

- All integration tests passing
- `pnpm run dev` followed by browsing `http://localhost:3000/library` shows zero CORS errors in the browser console
- `curl -i -X OPTIONS http://localhost:3001/api/library/books -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: GET"` returns the expected headers
