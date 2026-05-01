# Task Memory: task_06.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Add 9 missing shadcn primitives (dialog, sheet, tooltip, dropdown-menu, alert-dialog, slider, select, popover, tabs) on top of the 7 baseline primitives from task_01.
- Extend `apps/web/src/app/globals.css` with project-wide tokens: scholarly accent (warm sepia), status colors (ready/failed/progress), `--space-thread-row`, `--radius-cite-badge`. Map them under `@theme inline`.
- Honour ADR-006 — no shadcn AI primitives (`<InlineCitation>` etc.).
- Author `apps/web/src/app/_smoke/page.tsx` rendering one of every primitive (private folder under Next.js convention; not a runtime route — verified via component snapshot test only).
- Add unit tests: token resolution + smoke render snapshot + dark-mode token flip.

## Important Decisions

- Dark mode strategy: keep the `.dark { ... }` class block (next-themes runtime path from task_01) AND add a `@media (prefers-color-scheme: dark) { :root { ... } }` mirror per the task spec. The class block wins by source order so explicit theming would still work; without JS, the @media query handles SSR + system pref.
- Fonts: keep system serif/sans/mono fallback chains already declared in `--font-{serif,sans,mono}`. No `next/font` import. Rationale: task_01 already wired the variables, "(system or Inter)" / "Source Serif Pro or similar" leave room for system stacks, and adding `next/font` would touch `layout.tsx` outside this task's stated scope.
- Smoke page lives at `_smoke/page.tsx`. Next.js App Router treats `_*` folders as private (excluded from routing). Snapshot test renders the component directly. Subtask 6.5 (Lighthouse on smoke page) and 6.6 (README) defer to task_14 / task_15 per task spec note "or defer".

## Learnings

- `lucide-react` was already at 1.11.0 in apps/web from task_01; shadcn primitives (`alert-dialog`, `dialog`, `sheet`, etc.) all import from it via `XIcon` / `CheckIcon` etc. — no new icon dep needed.
- Radix-shipped components from this batch (Tooltip, Slider, Select, etc.) need extra jsdom polyfills (`ResizeObserver`, `DOMRect`, `scrollIntoView`, `*PointerCapture`) for Vitest. Polyfills live in `__tests__/vitest.setup.ts`; the smoke test would crash without them.
- The shadcn-generated `slider.tsx` keys thumbs by array index. Biome flags `noArrayIndexKey` as a warning. Kept upstream-clean (no `biome-ignore`) so future `npx shadcn add --update` applies cleanly; the rule fires at warning level only and matches semantics (thumb-at-index-N is a stable role).
- `extractBlock` regex helper in `tokens.test.ts` uses a `match.index === undefined` guard instead of a `!` non-null assertion — keeps Biome's `noNonNullAssertion` quiet while still narrowing the type.

## Files / Surfaces

- `apps/web/components.json` — already aligned in task_01; no edit needed.
- `apps/web/src/app/globals.css` — extended with scholarly + status tokens, `--space-thread-row`, `--radius-cite-badge`, `@media (prefers-color-scheme: dark)` mirror of `.dark`.
- `apps/web/src/app/_smoke/page.tsx` — new private route renders one of every primitive.
- `apps/web/src/components/ui/{alert-dialog,dialog,dropdown-menu,popover,select,sheet,slider,tabs,tooltip}.tsx` — shadcn-generated.
- `apps/web/__tests__/setup/tokens.test.ts` — token surface + JSDOM resolution + dark-mode flip.
- `apps/web/__tests__/app/smoke.test.tsx` — RTL render + console-warning assertion.
- `apps/web/__tests__/vitest.setup.ts` — added Radix polyfills.
- `apps/web/package.json` + `pnpm-lock.yaml` — `radix-ui ^1.4.3` added by shadcn.

## Errors / Corrections

- Initial `tokens.test.ts` used `match.index!` (non-null assertion) — fixed to a `=== undefined` guard before commit per Biome `noNonNullAssertion`.
- Verified `_smoke/page.tsx` is excluded from `next build` route table (`_`-prefixed app folder is private). Subtask 6.5 (Lighthouse) + 6.6 (README) deferred to task_14 / task_15 per the task spec ("or defer").

## Ready for Next Run

- task_07 (assistant-ui glue) consumes `Slider` + `Tooltip` + `DropdownMenu` + `Sheet` + `Select` + `Popover` from this batch. Tokens (`--scholarly`, `--space-thread-row`, `--radius-cite-badge`) are ready for citation-badge + thread-row layout.
