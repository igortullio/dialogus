# Task Memory: task_02.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Ship `encodeCursor` / `decodeCursor` + `InvalidCursorError` at `@dialogus/shared/http/cursor` per ADR-005.
- Status: completed.

## Important Decisions

- Used Zod v4 idiomatic `z.iso.datetime()` and `z.uuid()` instead of the deprecated `z.string().datetime()` / `z.string().uuid()` shown in ADR-005's pseudocode. Same runtime behavior, no deprecation noise.
- `InvalidCursorError(cursor, cause?)` — constructor signature matches ADR-005's `throw new InvalidCursorError(cursor, e)` example. Code is hard-coded to `INVALID_CURSOR`; the offending cursor is preserved on the instance for middleware/log context.
- Encoder type-rejects extra fields (`limit`, `direction`) via `CursorPosition` interface + TypeScript excess-property check; covered by a `@ts-expect-error` test so future refactors can't silently widen the API.

## Learnings

- `Buffer.from('not-base64', 'base64url')` does **not** throw on bad input — it returns whatever bytes Node can decode. Negative tests have to rely on `JSON.parse` or Zod failing downstream, not on the base64 step. Drove how the catch is structured.

## Files / Surfaces

- `packages/shared/src/http/cursor.ts` (new)
- `packages/shared/src/http/index.ts` (re-export)
- `packages/shared/src/errors/index.ts` (added `InvalidCursorError`)
- `packages/shared/package.json` (`./http/cursor` exports entry)
- `packages/shared/__tests__/http/cursor.test.ts` (new)
- `packages/shared/__tests__/exports.test.ts` (extended)
- `packages/shared/__tests__/errors.test.ts` (extended)

## Errors / Corrections

- First lint run failed on a Biome formatter line-width violation in the cursor test (one expression > 100 chars); reformatted.

## Ready for Next Run

- Cursor codec is the canonical helper for tasks 07 (DrizzleBookRepository), 13/14 (route layers), and the deferred `cursor.integration.test.ts` in task 14.
