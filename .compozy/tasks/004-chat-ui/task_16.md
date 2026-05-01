---
status: completed
title: "V1 cross-feature manual validation gate"
type: test
complexity: medium
dependencies:
    - task_15
---

# Task 16: V1 cross-feature manual validation gate

## Overview

Final cross-cutting manual validation that exercises Features 000 → 004 as a single integrated system, not as feature-isolated smokes. This task is the V1 dogfooding-readiness gate — passing it declares dIAlogus V1 production-ready for the owner's daily use. Uses Playwright MCP to drive the full UI journey, cURL to verify the API surface remains coherent under real load, and direct database/output assertions to confirm invariants the individual feature closures only checked in isolation.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST run against a clean environment (`pnpm db:reset && pnpm db:migrate && pnpm dev`) — the same starting point a fresh dogfooder would have.
- MUST exercise the full V1 user journey end-to-end through Playwright MCP, capturing snapshots at each stage:
  1. Open `http://localhost:3000`. Confirm landing renders with "Primeiros passos" card showing 3 books (Monte Cristo, Brás Cubas, Crime and Punishment).
  2. Click "Adicionar e ingerir" on Brás Cubas. Wait for `ready` (poll up to 10 minutes).
  3. Confirm `livros: 1 (prontos: 1)` on landing.
  4. Click "Adicionar e ingerir" on Crime and Punishment. Wait for `ready`.
  5. Navigate to `/library`. Confirm grid shows 2 `ready` books with covers + status badges.
  6. Open the AddGutendexSheet (left drawer). Search for "Tolstoy"; add War and Peace. Wait for `ready` (longer book — soak test for stage chain).
  7. Return to `/`. Click "Nova conversa". Multi-select Brás Cubas + Crime and Punishment.
  8. Send PT question: "como Capitu é descrita?". Wait for stream completion.
  9. Verify response contains `{{cite:...}}` markers parsed into `<sup>` badges (UI), AND each marker's chunk_id resolves via `GET /api/library/chunks/:id` (cURL).
  10. Hover a citation badge. Verify tooltip renders with chapter title + 200-char preview.
  11. Click the badge. Verify side panel opens (`<Sheet side="right">`); verify full chunk text + chapter context.
  12. Open thread header chip for Brás Cubas. Set spoiler cap to chapter 4. Send: "o que acontece no capítulo 10?". Verify response either has zero markers OR all marker chunk_ids reference chapters ≤ 4 (output assertion via cURL on each chunk_id).
  13. Send PT question that the book doesn't address ("qual o papel dos gnomos?"). Verify refusal-with-hints UX renders (no badges, ≥ 2 reformulation bullets).
  14. Switch language: send EN question on the same thread ("how is Capitu described?"). Verify agent responds in EN (language match per ADR-002).
  15. Rename the thread to "Brás Cubas + CeC compare". Refresh browser. Verify title persists.
  16. Pin the thread. Refresh. Verify pin persists (Fixadas group).
  17. Create another thread for War and Peace. Send a question. Verify large-book retrieval works.
  18. Delete the second thread via three-dot menu + confirm. Verify localStorage cleaned (`browser_evaluate` checks no `dialogus:spoiler_cap:<deleted_id>:*` keys).
  19. Run Lighthouse a11y on `/` and `/library`. Confirm scores ≥ 90.
- MUST capture observed metrics matching PRD Primary Success Metrics across all features:
  - **Catalog**: book add → ready transition latency per book.
  - **Ingestion**: per-book wall-clock time per stage (download/clean/parse/chunk/summarize/embed/index); peak RSS during War and Peace ingestion.
  - **RAG Agent**: first-token latency, full-response latency, citation resolvability rate, spoiler compliance, refusal appropriateness, language-match accuracy.
  - **Chat UI**: hover preview load time, side panel open time, Lighthouse a11y scores.
- MUST verify cross-feature invariants only visible at integration time:
  - `chapter_summaries` row count == `chapters` row count for every `ready` book (ADR-005 of 003 + ADR-008 of 002).
  - Every citation marker in any agent response references a `chunk_id` that exists in the database (no hallucinated IDs).
  - localStorage spoiler caps are read at message-send time and respected by the agent.
  - Mastra Memory thread metadata persists across browser refreshes (ADR-007 path verified at task_01).
- MUST record outcomes in a new `docs/v1-validation-log.md` (committed; portfolio artifact):
  - Date + environment (Node version, Postgres version, Mastra version).
  - Per-step pass/fail with timestamps + screenshot path.
  - Aggregate metrics table.
  - Known issues (if any) with severity.
- MUST NOT re-implement work covered by individual feature closures (000 task_21, 001 task_18, 002 task_18, 003 task_12+13, 004 task_15) — this task validates *integration*, not *features*. If an individual feature closure passes but cross-feature reveals a regression, the regression is the bug to fix; do not re-validate the closure.

</requirements>

## Subtasks

- [x] 16.1 Reset environment to clean state.
- [x] 16.2 Execute the 19-step user journey via Playwright MCP, capturing snapshots.
- [x] 16.3 Capture cross-feature observed metrics.
- [x] 16.4 Verify cross-feature invariants (SQL + endpoint checks).
- [x] 16.5 Author `docs/v1-validation-log.md` with outcomes.
- [x] 16.6 If gate fails, file issues; if gate passes, declare V1 production-ready.

## Manual Validation Methods

Cross-feature validation requires all three methods working in concert:

- **Endpoint testing** (cURL / httpie): per-step `curl` calls to assert backend state at each transition (e.g., after step 2, `GET /api/library/books?status=ready` returns 1 book; after step 6, returns 3). Captures SSE streams from `apps/mastra` to verify markers + tool_outputs.
- **UI verification (Playwright MCP)**: drives the entire journey via `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`, `browser_take_screenshot`, `browser_evaluate`. Each step's snapshot is a structured accessibility tree captured as evidence; each screenshot is a visual artifact for the validation log.
- **Output validation**: SQL queries against the live Postgres (`chapter_summaries` count, chunk_id existence checks); JSON assertions on cURL responses (envelope + Problem Details shapes); regex assertions on rendered prose (`{{cite:...}}` regex from `@dialogus/rag`).

## Implementation Details

Reference each feature's closure task for the per-feature smoke sequence; this task's contribution is the *cross-feature integration* that no single closure can capture. The 19 steps in the requirements are sequential and idempotent — re-running step 5 should give the same result as the first run.

Playwright MCP requires an AI assistant capable of issuing browser tool calls; if running this task manually without an assistant, the steps translate to manual browser interactions documented with screenshots. Either path produces the same `v1-validation-log.md` outcome.

If the task discovers a regression that was masked by feature-isolated closures (e.g., 002 task_18 passed but cross-feature reveals chapter_summaries are missing on a re-ingested book), the regression becomes a bug; opening a fix is part of this task's outcome.

### Relevant Files

- `.compozy/tasks/000-foundation/task_21.md` — Foundation closure (reference, not re-run).
- `.compozy/tasks/001-catalog/task_18.md` — Catalog closure (reference).
- `.compozy/tasks/002-ingestion/task_18.md` — Ingestion closure (reference).
- `.compozy/tasks/003-rag-agent/task_13.md` — RAG Agent closure (reference).
- `.compozy/tasks/004-chat-ui/task_15.md` — Chat UI closure (reference).
- `apps/mastra/src/scripts/curl/*.sh` — cURL smoke scripts from Feature 003 task_11.
- All 5 PRDs § Success Metrics — source of measurable targets.

### Dependent Files

- `docs/v1-validation-log.md` (new — portfolio artifact)
- `docs/v1-screenshots/` (new — folder of step-by-step PNGs)
- `README.md` (potentially modify: add link to validation log under "V1 Status")

### Related ADRs

- All 42 ADRs across product + 5 features — every assertion in this task traces back to an ADR.

## Deliverables

- `docs/v1-validation-log.md` with per-step outcomes, metrics, screenshots.
- 19+ screenshots in `docs/v1-screenshots/`.
- Optional: bug list (if regressions surface).
- Unit tests with 80%+ coverage **(REQUIRED)** — structural log + screenshot count check.
- Integration tests **(REQUIRED)** — the full Playwright MCP journey IS the integration test.

## Tests

- Unit tests:
  - [ ] `docs/v1-validation-log.md` exists and contains a "Per-Step Outcomes" section with 19 entries.
  - [ ] `docs/v1-validation-log.md` "Metrics" section records numerical values for ≥ 10 metrics.
  - [ ] `docs/v1-screenshots/` contains ≥ 15 image files.
- Integration tests (the actual journey):
  - [ ] All 19 steps pass on a clean environment.
  - [ ] Cross-feature invariants verified: chapter_summaries count matches chapters; all cited chunk_ids resolve; spoiler caps respected end-to-end.
  - [ ] Lighthouse a11y ≥ 90 on `/` and `/library`.
  - [ ] No console errors during the journey (browser_console_messages reports clean).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- 19/19 journey steps green.
- All cross-feature invariants verified.
- `docs/v1-validation-log.md` is the authoritative V1 production-readiness artifact.
- V1 dogfooding declared READY (or, if regressions surface, bug list filed and a remediation plan exists).
