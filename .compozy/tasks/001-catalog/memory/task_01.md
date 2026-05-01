# Task Memory: task_01.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Ship `envelope()` and `problemDetails()` in a new `@dialogus/shared/http` submodule, with unit tests, exports map entries, and barrel re-exports.

## Important Decisions

- Title for `problemDetails` is derived from the slug via simple kebab→Title-Case (e.g., `validation-failed` → `Validation Failed`). The 4-arg signature in the techspec leaves no room for an explicit title; routes can override later if a slug needs a custom title.
- `instance` field is left to the route/middleware (request URL is unknown to the helper).
- `meta`/`links` and `detail`/`errors` are emitted only when the caller passes them, to keep the on-the-wire JSON minimal.

## Learnings

- Repo lint run currently has 5 pre-existing warnings in `__tests__/ci-workflow.test.ts` and `__tests__/docker-compose.test.ts` (`noTemplateCurlyInString`). They are unrelated to catalog work.
- `noUncheckedIndexedAccess` is on; `word[0]` is `string | undefined`. Avoiding non-null assertions per Biome `noNonNullAssertion`.

## Files / Surfaces

- `packages/shared/src/http/envelope.ts` (new)
- `packages/shared/src/http/problem.ts` (new)
- `packages/shared/src/http/index.ts` (new barrel)
- `packages/shared/src/index.ts` (added `./http/index.js` re-export)
- `packages/shared/package.json` (added `./http`, `./http/envelope`, `./http/problem` to `exports`)
- `packages/shared/__tests__/http/envelope.test.ts` (new)
- `packages/shared/__tests__/http/problem.test.ts` (new)
- `packages/shared/__tests__/exports.test.ts` (extended)

## Errors / Corrections

- First draft used `word[0]!.toUpperCase()` which Biome flags as `noNonNullAssertion`. Refactored into a `capitalize()` helper using `String.prototype.charAt(0)` (returns `''` safely) instead.

## Ready for Next Run

- Task 11 (`apps/api` problem middleware) and Task 13/14 (route integration) consume these helpers — import path is `@dialogus/shared/http` (barrel) or `@dialogus/shared/http/envelope` / `@dialogus/shared/http/problem` directly.
