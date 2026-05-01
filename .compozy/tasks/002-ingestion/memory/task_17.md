# Task Memory: task_17.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Extend the apps/web landing Server Component to fetch + render `livros: T (prontos: N)` alongside the existing health line.

## Important Decisions

- `fetchLibraryCountByStatus` validates each response with a `isCountEnvelope` type guard (non-negative integer `meta.count`) and returns `{ total: 0, ready: 0 }` for any error path: throws, non-2xx, missing `meta.count`, or non-integer count. Single try/catch around `Promise.all` keeps the fallback uniform.
- Default base URL fallback (`http://localhost:3001`) lives in this module as `DEFAULT_BASE_URL` and is asserted in tests so unset `NEXT_PUBLIC_API_URL` keeps the page rendering.
- Tests stub `globalThis.fetch` via `vi.stubGlobal('fetch', vi.fn())` and assert the exact `(url, { cache: 'no-store' })` call shape — no MSW for this surface (simpler, page.tsx already mocks via `vi.mock`).

## Learnings

- Biome's formatter (config in this repo) requires parens around single-arg arrow params (`(resolve) => …`); shorthand `resolve => …` fails `pnpm lint`. The 5 remaining `noTemplateCurlyInString` warnings on `__tests__/ci-workflow.test.ts` and `__tests__/docker-compose.test.ts` are pre-existing in foundation tests.
- `vi.mocked(...)` plus `await import('...')` after `vi.mock(...)` is the existing pattern in `apps/web/__tests__/app/page.test.tsx` for mocking server-component lib fetches; reused for the new `fetchLibraryCountByStatus` mock.
- Page component continues to render heading + status line as separate elements (`<h1>dIAlogus</h1>` + `<p>api: … / livros: T (prontos: N)</p>`) — the techspec's "dIAlogus — api: …" wording is a logical render shape, not a literal single-line render.

## Files / Surfaces

- `apps/web/src/lib/library.ts` (new)
- `apps/web/src/app/page.tsx` (modified)
- `apps/web/__tests__/lib/library.test.ts` (new)
- `apps/web/__tests__/app/page.test.tsx` (modified)

## Errors / Corrections

- First lint run flagged formatter diff on `library.test.ts` (`resolve =>` → `(resolve) =>`); fixed inline before final verify.

## Ready for Next Run

- task_18 (smoke + closure) is the next pending task; depends on tasks 14, 15, 16, 17, 24. With task_17 done, it's blocked only by task_24 (summarize handler registration).
