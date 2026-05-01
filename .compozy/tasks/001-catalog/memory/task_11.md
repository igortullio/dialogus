# Task Memory: task_11.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Catalog Task 11: ship the global RFC 9457 Problem Details middleware in `apps/api/src/infrastructure/http/middleware/problem.ts` plus its unit tests.

## Important Decisions

- Middleware uses post-`next()` inspection of `c.error` instead of try/catch around `next()`. Hono's `compose` already catches handler throws and routes them through the registered `app.errorHandler` (default 500 "Internal Server Error"), so a try/catch around `next()` never fires. Reading `c.error` after `next()` and overwriting `c.res` is the only middleware-shaped path that lets `app.use(...)` win without rewiring `app.onError`.
- After mapping, the middleware also clears `c.error = undefined` so downstream middleware (e.g., future logger/trace) don't see the error as unhandled.
- Body extension fields (`instance`, `existing_book_id`) are spread onto the `problemDetails()` result inline — `ProblemDetails` from `@dialogus/shared` does not yet model them and the techspec keeps the helper framework-agnostic.
- `trace_id` log field is sourced from `c.get('traceId')` first, falling back to the `x-trace-id` request header; no trace-id middleware exists yet, but task_15 wires it.

## Learnings

- Hono compose returns the context (never throws) when a route handler raises an `Error` and an `errorHandler` is set. Non-Error throws still bubble up; both `compose` and `Hono.#dispatch` re-throw them.
- pino does not auto-apply `stdSerializers.err` to arbitrary keys — `error: err` only carries a stack when the logger is constructed with `serializers: { error: stdSerializers.err }` (matches the production logger in `apps/api/src/index.ts`).
- Biome v2 doesn't recognize the `lint/suspicious/noThrowLiterals` slug; throw-literal suppression isn't needed in Hono test files anyway since the rule isn't enabled.

## Files / Surfaces

- `apps/api/src/infrastructure/http/middleware/problem.ts` (new): `createProblemMiddleware({ logger })` factory + `ProblemVariables` type.
- `apps/api/__tests__/middleware/problem.test.ts` (new): 12 cases covering all mapped error classes, unknown fallback, success pass-through, non-Error rethrow, trace_id sourcing.
- `apps/api/package.json`: added `@dialogus/catalog: workspace:*` and `zod: ^4.0.0` runtime deps (middleware + future routes need them).

## Errors / Corrections

- First implementation used `try/catch` around `await next()` and returned a Response. Tests showed Hono's default `errorHandler` had already captured the throw and finalized `c.res = "Internal Server Error"`, so our try/catch never ran. Fixed by switching to `c.error` post-`next()` inspection and direct `c.res = ...` override.

## Ready for Next Run

- Task_15 (boot composition) should `app.use('*', createProblemMiddleware({ logger }))` as the outermost middleware so every downstream handler is covered.
- Task_18 README closure must add the slug `internal-error` (not in the prior techspec slug list) to the "API Problems" enumeration alongside the existing slugs (`duplicate-gutendex-id`, `book-not-found`, `gutendex-upstream-error`, `invalid-cursor`, `validation-failed`, `idempotency-key-conflict`).
