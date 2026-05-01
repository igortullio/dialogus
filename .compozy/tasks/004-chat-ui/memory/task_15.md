# Task Memory: task_15.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Closed Feature 004 structurally: README "Stack" + "Chat UI (feature 004)" section, `_prd.md` Exit Criteria Verification annotation, 6 mockup screenshots, screencast scene plan, 14-task completion check.
- Real-data dogfood (sustainability metric, real-Anthropic latency, screencast capture) bundled into task_16 — the V1 closure gate.

## Important Decisions

- Shipped 6 mockup PNGs rendered against project tokens via `docs/screenshots/_render-mockups.mjs` instead of trying to bring up the full stack with real Anthropic/OpenAI keys in this session. Swapped for real captures during task_16 dogfood.
- Screencast: shipped scene-by-scene script + recording checklist at `docs/SCREENCAST.md` rather than committing a fake video. README links to the doc, so the placeholder→final-link transition is a single edit.
- `_prd.md` annotation marks owner-driven metrics as ⏳ explicitly (sustainability, real-Anthropic latency, bundle, TTI, screencast) so the closure is honest, not performative.

## Learnings

- `playwright` package is not resolvable from `docs/` — the script imports from `apps/web/node_modules/@playwright/test/index.mjs` via `pathToFileURL` to avoid the strict node-modules walk.
- Playwright 1.51.1 needs `chromium-1161`; the existing `chromium-1217` cache is for a newer Playwright. Run `pnpm --filter @dialogus/web exec playwright install chromium` if regenerating.
- `pnpm test` flakes occasionally on `@dialogus/ingestion` `GutendexDownloader` rate-limiting test (999 ms vs 1000 ms tolerance on macOS). Re-run is reliably green; pre-existing.

## Files / Surfaces

- `README.md` — added "Stack" section + "Chat UI (feature 004)" section.
- `.compozy/tasks/004-chat-ui/_prd.md` — appended Exit Criteria Verification.
- `.compozy/tasks/004-chat-ui/_tasks.md` — task 15 → completed.
- `.compozy/tasks/004-chat-ui/_meta.md` — completed counter 14 → 15.
- `docs/screenshots/{landing-empty,thread-with-citations,citation-side-panel,spoiler-slider,library-grid,gutendex-drawer}.png` — new (rendered).
- `docs/screenshots/_render-mockups.mjs` — new render script.
- `docs/SCREENCAST.md` — new recording plan.
- `__tests__/feature-004-closure.test.ts` — new (13 structural assertions).

## Errors / Corrections

- First test run failed because the closure annotation didn't mention "localStorage" verbatim. Fixed by adding the localStorage key path + delete-cleanup reference into the spoiler-cap evidence row (genuinely improves the row, not just a test patch).

## Ready for Next Run

- task_16 (V1 closure gate): owner runs the 2-week dogfood, captures real screenshots replacing the mockups in `docs/screenshots/`, records the 3-minute screencast at `docs/screencast.mp4` (or external link), updates the ⏳ rows in `_prd.md` Exit Criteria Verification with real numerical values.
