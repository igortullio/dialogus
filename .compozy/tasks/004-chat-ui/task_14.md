---
status: completed
title: "Playwright integration + Lighthouse a11y + CI extension"
type: test
complexity: medium
dependencies:
  - task_11
  - task_12
  - task_13
---

# Task 14: Playwright integration + Lighthouse a11y + CI extension

## Overview

Author the Playwright happy-path E2E test that exercises all four user journeys (search → ingest → ask → spoiler-safe read), the Lighthouse a11y audit smoke runs on `/` and `/library`, and extend `.github/workflows/ci.yml` with two new jobs (`integration` for Playwright, `a11y` for Lighthouse). This is the test surface that gates Feature 004 closure.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST install Playwright + @axe-core/playwright in `apps/web/package.json`.
- MUST author `apps/web/__tests__/integration/happy-path.spec.ts` covering the full journey:
  - Open `/`. Wait for "Primeiros passos" card.
  - Click "Adicionar e ingerir" on Brás Cubas. Wait for `ready` (poll up to 10 minutes).
  - Click "Nova conversa". Verify book picker shows Brás Cubas.
  - Select Brás Cubas. Type "quem é o narrador?". Send.
  - Wait for stream completion. Assert at least one `<sup>` badge exists with `aria-label` matching `/Citação \d+/`.
  - Click the badge. Assert `<Sheet>` opens. Assert the panel contains chapter context.
  - Set spoiler cap to chapter 3 via thread header. Send "o que acontece no capítulo 5?". Assert response either has no badges or all badges reference chapters ≤ 3.
  - Rename the thread to "Memorias deep dive". Refresh browser. Assert title persists.
  - Pin the thread. Refresh. Assert pin persists; thread is in "Fixadas" group.
  - Delete a different test thread (create one first). Assert localStorage cleaned (`evaluate` checks no `dialogus:spoiler_cap:<deleted_id>:*` keys).
- MUST author `apps/web/__tests__/a11y/lighthouse.test.ts` (or similar):
  - Open `/`. Run Lighthouse a11y audit. Assert score ≥ 90.
  - Open `/library`. Run Lighthouse a11y audit. Assert score ≥ 90.
  - Optionally: open the citation panel state; run @axe-core to assert no a11y violations.
- MUST extend `.github/workflows/ci.yml`:
  - New job `integration-web` runs Playwright against a built `apps/web` (with `apps/api`, `apps/mastra`, `apps/worker`, Postgres all booted via docker-compose-ish setup or Testcontainers + node).
  - New job `a11y` runs Lighthouse audit. Can run in the same `integration-web` job for budget.
  - Wall-clock budget: ≤ 10 minutes for integration; ≤ 5 minutes for a11y.
- MUST mock external APIs (Anthropic, OpenAI) at the apps/api/apps/mastra layer using MSW or process-level interception. Real Postgres + apps must run; LLM round-trips must NOT.
- MUST configure Playwright to use headless mode in CI; `webServer` config to start `pnpm dev` automatically before tests.

</requirements>

## Subtasks

- [x] 14.1 Install Playwright + axe-core + configure `playwright.config.ts`.
- [x] 14.2 Author `happy-path.spec.ts`.
- [x] 14.3 Author `lighthouse.test.ts` for `/` and `/library`.
- [x] 14.4 Extend `ci.yml` with `integration-web` + `a11y` jobs.
- [x] 14.5 Verify wall-clock budget; parallelize if necessary.
- [x] 14.6 Document local-run procedure in `apps/web/README.md` (or task_15).

## Implementation Details

Reference TechSpec § Testing Approach → Integration Tests + Accessibility Tests for the full content. Playwright's `webServer` config can boot `pnpm dev` automatically; alternatively, the CI job runs apps in background steps and Playwright connects to them.

For LLM mocking: the cleanest approach is to set `ANTHROPIC_API_KEY=test-key` and `OPENAI_API_KEY=test-key`; `apps/mastra` uses MSW (or env-aware switching to `MockQueryEmbedder` + a mock Anthropic provider) when these test keys are detected. Document the mock-mode env in `apps/mastra` if needed; coordinate with Feature 003.

For ingestion path: in CI, the test seeds books via API + `MockChapterSummaryGenerator` + `MockEmbeddingProvider` (already wired in Feature 002 amendment); ingestion completes deterministically in ~10s without LLM cost.

### Relevant Files

- `apps/web/src/app/page.tsx` (task_11).
- `apps/web/src/app/library/page.tsx` (task_12).
- `apps/web/src/components/citation/CitationBadge.tsx` (task_08) — assertion target.
- `.github/workflows/ci.yml` (Foundation, extended) — extension target.
- TechSpec § Testing Approach — primary reference.

### Dependent Files

- `apps/web/playwright.config.ts` (new)
- `apps/web/__tests__/integration/happy-path.spec.ts` (new)
- `apps/web/__tests__/a11y/lighthouse.test.ts` (new)
- `apps/web/package.json` (modify: add deps)
- `.github/workflows/ci.yml` (modify: 2 new jobs)

### Related ADRs

- All Feature 004 ADRs — happy-path test exercises the entire stack.

## Deliverables

- Playwright integration test.
- Lighthouse a11y test.
- CI jobs configured + green on `main`.
- Unit tests with 80%+ coverage **(REQUIRED)** — Playwright + Lighthouse setup smoke.
- Integration tests **(REQUIRED)** — this task IS the integration suite.

## Tests

- Unit tests:
  - [ ] `playwright.config.ts` exports a valid Playwright `defineConfig` shape.
  - [ ] `lighthouse.test.ts` smoke: stub Lighthouse, assert audit-runner is configured.
- Integration tests (the actual Playwright suite):
  - [ ] Happy-path test passes end-to-end on a clean local environment.
  - [ ] Lighthouse a11y on `/` ≥ 90.
  - [ ] Lighthouse a11y on `/library` ≥ 90.
  - [ ] CI integration-web job duration ≤ 10 min.
  - [ ] CI a11y job duration ≤ 5 min.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- CI green on `main` after merge.
- Local-run instructions documented (`pnpm test:e2e`).
- Zero LLM API calls in CI.
