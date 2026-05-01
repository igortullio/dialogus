# Task Memory: task_18.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Replace `apps/web/src/app/page.tsx` placeholder with async Server Component that calls `fetchHealth()` and renders `<h1>dIAlogus</h1>` + status line with `api/db/pgboss` values.
- Update `apps/web/__tests__/app/page.test.tsx` to mock `fetchHealth` and assert text-content scenarios.

## Important Decisions

- Used inline `style` objects (typed as `CSSProperties`) instead of a `<style>` block. Reason: avoids polluting `container.textContent` (which would include CSS rule text) while keeping zero external CSS deps. Either form is allowed by the task spec.
- Heading + status line are separated into `<h1>` and `<p>` rather than a single concatenated string. Status line format: `api: {api} / db: {db} / pgboss: {pgboss}`. Together with the `<h1>`, the rendered text contains both `dIAlogus` and the three verbatim status values per spec.

## Learnings

- Async React Server Components are testable in vitest+jsdom by calling `await Page()` to get a resolved JSX element, then passing it to `render()` from `@testing-library/react`. No `Suspense` boundary needed for a single top-level component.
- Mocking the local `health.ts` module via `vi.mock('../../src/lib/health', () => ({ fetchHealth: vi.fn() }))` and re-importing with top-level `await import(...)` avoids stubbing global `fetch` and gives a typed handle via `vi.mocked(fetchHealth)`.
- `next build` reports the landing route as `ƒ (Dynamic)` because `fetchHealth` calls `fetch` with `cache: 'no-store'` — expected and required by ADR-001 (status must reflect live probe results, not a stale render).

## Files / Surfaces

- Modified: `apps/web/src/app/page.tsx` — sync placeholder → async Server Component.
- Rewritten: `apps/web/__tests__/app/page.test.tsx` — adds 5 cases (all-up, db-down, pgboss-down, async-function, no use-client).

## Errors / Corrections

- None.

## Ready for Next Run

- Task_19 (CI workflow) can rely on the full Foundation E2E proof working: `pnpm test` exercises the new page render path with mocked `fetchHealth`, `next build` succeeds.
- Task_21 fresh-clone smoke can verify the visible string format is `api: up / db: up / pgboss: up` (spaces around `/`, lowercase status words).
