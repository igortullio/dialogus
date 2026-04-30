# Task Memory: task_16.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Add `fetchLibraryCount(): Promise<number>` to `apps/web/src/lib/library.ts` and render "livros: N" in the `apps/web/src/app/page.tsx` status line.

## Important Decisions

- `fetchLibraryCount` added alongside existing `fetchLibraryCountByStatus` in `library.ts` — both coexist; the new one is simpler and uses `listLibraryResponseSchema` (Zod) per task spec; the existing one uses a manual type guard.
- Status line rendered as a `<span data-testid="dialogus-status">` inside `HydrationBoundary` as first sibling of `DialogusLanding`. This keeps `HydrationBoundary` as root so the existing `props.state` test still passes.
- `aria-label` removed from the span — Biome `useAriaPropsSupportedByRole` rejects it on a plain `<span>` without a role.
- page.tsx structure: parallel fetch via `Promise.all([fetchHealth(), fetchLibraryCount()])` before thread prefetch; status string is a template literal (single string child — avoids JSX array fragments that complicate JSON.stringify checks).

## Learnings

- `JSON.stringify(reactElement)` works for checking rendered text in server component JSX tests when the text is a single string child (template literal), not JSX interpolation array.
- page.test.tsx uses dynamic imports after `vi.mock` hoisting — adding new mocks for `../../src/lib/health` and `../../src/lib/library` follows the same pattern.

## Files / Surfaces

- `apps/web/src/lib/library.ts` — added `fetchLibraryCount` export
- `apps/web/src/app/page.tsx` — added parallel fetch + status span
- `apps/web/__tests__/lib/library.test.ts` — added `fetchLibraryCount` describe block (6 tests)
- `apps/web/__tests__/app/page.test.tsx` — added mocks for fetchHealth + fetchLibraryCount, added 3 new tests

## Errors / Corrections

- Biome `lint/a11y/useAriaPropsSupportedByRole` fired on `aria-label` on a plain `<span>` — removed the attribute.

## Ready for Next Run

Task complete. 372 tests pass, typecheck clean, Biome clean.
