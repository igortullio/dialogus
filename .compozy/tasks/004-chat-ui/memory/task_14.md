# Task Memory: task_14.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Author the Playwright happy-path E2E (search → ingest → ask → spoiler-safe read → rename → pin → delete), the Lighthouse a11y audit on `/` + `/library`, and extend `.github/workflows/ci.yml` with `integration-web` (≤ 10 min) and `a11y` (≤ 5 min) jobs. Mock LLMs at `apps/mastra` so CI does zero outbound Anthropic / OpenAI calls.

## Important Decisions

- LLM mocking lives in `apps/mastra/src/test-mocks/anthropic-msw.ts` and activates when `E2E_MOCK_LLM=1`. msw promoted to runtime dep in `apps/mastra/package.json` (Mastra build bundles it). No behavior change when the env flag is unset.
- Embedding + summary generation already short-circuit via `EMBEDDING_PROVIDER=mock` / `SUMMARY_GENERATOR=mock` on the worker side, so the only LLM round-trip in the test stack is Anthropic — and that's the one MSW intercepts.
- Playwright config splits into two projects (`integration`, `a11y`) with `testMatch: /\.spec\.ts$/` so vitest's `*.test.{ts,tsx}` corpus stays out of the Playwright runner. Vitest's `apps/web/vitest.config.ts` also excludes `__tests__/integration/**` and `__tests__/a11y/**`.
- `playwright.config.ts` `webServer` auto-starts `pnpm --filter @dialogus/web dev` locally; CI sets `PLAYWRIGHT_DISABLE_WEB_SERVER=1` and pre-boots the stack via the workflow's own steps.
- Lighthouse helpers are split: `apps/web/__tests__/helpers/lighthouse-config.ts` carries pure data + `collectFailingAudits` (vitest-importable in jsdom); `lighthouse-runner.ts` adds the actual `lighthouse` + `chrome-launcher` invocation (Node-only, used inside Playwright).
- Integration-web job uses `pgvector/pgvector:pg17` GitHub service container (matches the docker-compose fallback documented in root README); a11y job uses the same pin.

## Learnings

- The Mastra dev/build pipeline does *not* statically remove unreachable imports — even guarded by `if (process.env.E2E_MOCK_LLM === '1')`, the import gets bundled. Hence msw must be a runtime dep, not a devDep.
- `lighthouse@12` is full ESM and pulls heavy Node-only deps; importing the runner from a vitest spec under jsdom *would* work but is wasteful. The split into `lighthouse-config.ts` keeps the helper unit-testable without lifting Node-only modules.
- Playwright's `defineConfig` returns the config plain. The unit test imports `apps/web/playwright.config.ts` from vitest (jsdom env) and asserts the shape directly via `mod.default`.
- Foundation's `__tests__/ci-workflow.test.ts` was anchored to the original 4-job layout and `services: undefined`. It needed extending — added two new assertions for `integration-web` and `a11y` and replaced the "no Postgres service" rule with a positive assertion that *only* those two jobs declare a Postgres service container.

## Files / Surfaces

- New: `apps/web/playwright.config.ts`, `apps/web/__tests__/integration/happy-path.spec.ts`, `apps/web/__tests__/a11y/lighthouse.spec.ts`, `apps/web/__tests__/helpers/lighthouse-config.ts`, `apps/web/__tests__/helpers/lighthouse-runner.ts`, `apps/web/__tests__/playwright-config.test.ts`, `apps/web/__tests__/lighthouse-runner.test.ts`, `apps/web/README.md`.
- New: `apps/mastra/src/test-mocks/anthropic-msw.ts`, `apps/mastra/__tests__/test-mocks/anthropic-msw.test.ts`.
- Modified: `apps/web/package.json` (devDeps, scripts), `apps/web/vitest.config.ts` (exclude playwright dirs), `apps/mastra/package.json` (msw → deps), `apps/mastra/src/index.ts` (env-gated mock activation), `.github/workflows/ci.yml` (integration-web + a11y jobs), `__tests__/ci-workflow.test.ts` (assertions for new jobs).
- Selectors leveraged (existed prior to this task): `data-slot` on `onboarding-book-card`, `onboarding-add-button`, `thread-sidebar-new`, `book-picker-trigger`, `book-picker-content`, `dialogus-composer`, `dialogus-composer-send`, `dialogus-composer-cancel`, `dialogus-message-row`, `citation-badge`, `citation-side-panel`, `citation-side-panel-content`, `thread-header-chip`, `thread-header-popover`, `thread-header-slider`, `thread-header-cap-readout`, `thread-row`, `thread-row-menu-trigger`, `thread-row-rename`, `thread-row-rename-input`, `thread-row-pin`, `thread-row-delete`, `thread-row-delete-confirm`, `thread-sidebar-pinned`, `empty-state-card`.

## Errors / Corrections

- First Playwright install pulled `@playwright/test@1.50.1` which violated Next 16's `^1.51.1` peer; bumped to `1.51.1`.
- `lighthouse-runner.ts` `output: 'json'` raised a TS error against the Lighthouse Flags type; fixed with `as const`.
- An unused `readSelectedBookId` helper triggered TS6133; removed.
- After splitting Lighthouse helpers, the spec's runner import was left with both `LighthouseAuditResult` (type-only) and `runLighthouseA11y` (value); biome flagged the import shape and auto-fixed it.

## Ready for Next Run

- task_15 (manual smoke + screencast + Feature 004 closure): the Playwright + Lighthouse stack is in place; smoke procedure should reuse the env vars documented in `apps/web/README.md`. The closure commit can record Lighthouse scores from the `a11y` CI job artifacts.
- Open question for task_15 / task_16: the Anthropic MSW mock returns deterministic but minimal responses (one tool_use → one final text with a single `{{cite:<chunk_id>}}`). If the happy-path test needs richer multi-citation scenarios, extend `_internals.deriveResponseText` to return multiple markers.
- The mock path doesn't yet test the refusal-with-hints branch end-to-end (it returns hints when `chunks` is empty, but the happy-path test seeds Brás Cubas, so empty chunks are unlikely). Phase 2 follow-up.
