# Task Memory: task_17.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Status: completed.
- Implemented `fetchHealth()` and unit tests; never-throws contract upheld via try/catch + safeParse path.

## Important Decisions

- Read `process.env.NEXT_PUBLIC_API_URL` at call time (inside `fetchHealth`) rather than module load, so vitest can flip the env var per test without dynamic re-imports.
- Treated non-2xx as failure without parsing the body (no `await response.json()` after an `!ok` short-circuit) — keeps the fallback path branch-light and sidesteps double-throw risk on malformed bodies.

## Learnings

- `vi.fn<typeof fetch>()` + `vi.stubGlobal('fetch', mock)` avoids the `mockImplementation` cast dance and gives correct signature inference for `fetchMock.mockResolvedValueOnce(new Response(...))`.
- Biome formatter wraps argument lists at 100 cols even inside a single function call; `pnpm lint:fix` is the path of least resistance after authoring nested `mockResolvedValueOnce(jsonResponse(...))` invocations.

## Files / Surfaces

- `apps/web/src/lib/health.ts` (new)
- `apps/web/__tests__/lib/health.test.ts` (new)

## Errors / Corrections

- (none)

## Ready for Next Run

- Task_18 can import `fetchHealth` from `@/lib/health` (or relative path) inside the async Server Component — fallback semantics already match task_18's down-state UX.
