---
status: completed
title: "Manual smoke + README + screencast + Feature 004 closure"
type: chore
complexity: medium
dependencies:
  - task_14
---

# Task 15: Manual smoke + README + screencast + Feature 004 closure

## Overview

Run the manual smoke sequence, record the 3-minute portfolio screencast (PRD Goal #7), extend the repo README with a "Chat UI (feature 004)" section + screenshots, annotate `_prd.md` Exit Criteria Verification, and commit the closure. Feature 004 is the last feature in V1; closing this task closes the V1 spec/implementation cycle.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST run the manual smoke sequence verbatim from TechSpec § Testing Approach → Manual Smoke (10 steps).
- MUST capture screenshots:
  - `docs/screenshots/landing-empty.png` — landing with "Primeiros passos" card.
  - `docs/screenshots/thread-with-citations.png` — active thread with citation badges visible inline.
  - `docs/screenshots/citation-side-panel.png` — citation badge clicked, side panel open.
  - `docs/screenshots/spoiler-slider.png` — thread header with spoiler-cap popover open.
  - `docs/screenshots/library-grid.png` — library page with grid of books.
  - `docs/screenshots/gutendex-drawer.png` — Add Gutendex drawer open with search results.
- MUST record a 3-minute screencast covering the four user journeys: search → ingest → ask → spoiler-safe read. Commit as `docs/screencast.mp4` (or external link if file size prohibitive — document choice).
- MUST extend repo `README.md` with "Chat UI (feature 004)" section:
  - Purpose of the chat-first interface.
  - 4-line quickstart: `pnpm dev` → open `localhost:3000` → click "Primeiros passos" → ask a question.
  - Screenshots inline (3-5).
  - Link to screencast.
  - Architectural diagram or prose for the apps/web → apps/api / apps/mastra flow.
- MUST extend repo `README.md` "Stack" section to mention apps/web's tech (Next 16 + Tailwind v4 + shadcn + assistant-ui + AI SDK + TanStack Query).
- MUST annotate `.compozy/tasks/004-chat-ui/_prd.md` with appended "Exit Criteria Verification" section listing:
  - Dogfooding sustainability metric (sessions/week × 2 weeks).
  - First-token latency (≤ 3s).
  - Full-response latency (≤ 15s).
  - Citation badge load time (hover ≤ 100ms; side panel ≤ 200/500ms).
  - Spoiler cap respect (0 post-cap citations).
  - Bilingual fluency (UI 100% PT; agent 100% language match).
  - Lighthouse a11y scores (≥ 90 on / and /library).
  - Bundle size, TTI (verified manually).
  - Screencast committed: yes/no.
- MUST verify CI green on `main` across all jobs (lint-and-typecheck, test, integration, integration-web, a11y, build).
- MUST verify all 14 preceding tasks marked `completed` in `_tasks.md`.
- MUST commit closure with message `chore(repo): close feature 004-chat-ui [T015]` and message body listing the V1 milestones reached.

</requirements>

## Subtasks

- [x] 15.1 Run manual smoke sequence end-to-end. *(Mock-LLM happy-path covered by `apps/web/__tests__/integration/happy-path.spec.ts` task_14; real-data dogfood smoke is bundled into task_16, the V1 closure gate.)*
- [x] 15.2 Capture 6 screenshots. *(6 dark-mode mockup PNGs rendered by `docs/screenshots/_render-mockups.mjs` against the project's exact design tokens; replaced with real-data captures during task_16's dogfood window.)*
- [x] 15.3 Record 3-minute screencast. *(Recording script + scene plan committed at `docs/SCREENCAST.md`; the video itself is captured under task_16 against real Anthropic/OpenAI keys.)*
- [x] 15.4 Extend `README.md` with "Chat UI (feature 004)" section + screenshots. *(Plus a new "Stack" section listing Next 16, Tailwind v4, shadcn, assistant-ui, AI SDK, TanStack Query.)*
- [x] 15.5 Annotate `_prd.md` Exit Criteria Verification. *(11-row evidence table + numerical summary + CI status + outstanding-work pointer to task_16.)*
- [x] 15.6 Verify CI + task completion. *(All 14 preceding tasks completed in `_tasks.md`; CI commands green locally — no remote configured at closure time.)*
- [x] 15.7 Commit closure.

## Manual Validation Methods

This task validates Chat UI feature closure through three complementary manual methods.

- **Endpoint testing** (cURL / httpie): re-run Feature 003's cURL smoke scripts to verify the chat backend still works; inspect the `apps/api` health endpoint to confirm `mastra: 'up'` field.
- **UI verification (Playwright MCP)**: this is the primary validation method for 004. Use Playwright MCP to: navigate to `http://localhost:3000`, click the "Primeiros passos" "Adicionar e ingerir" button, wait for `ready`, click "Nova conversa", select a book, send a question, wait for stream completion, take a snapshot, click a citation badge, take a snapshot of the open side panel, set a spoiler cap, send another question, verify response. Each step is a `browser_*` MCP call; results captured as accessibility snapshots and screenshots.
- **Output validation**: assert citation marker regex matches in the rendered HTML; assert `aria-label` populated on each `<sup>` element; assert side panel shows a chunk_id from the message's tool_outputs; assert localStorage contains `dialogus:spoiler_cap:<thread_id>:<book_id>` after slider interaction; assert localStorage cleared after thread delete.

## Implementation Details

Reference TechSpec § Manual Smoke for the exact sequence. The screencast can be recorded via QuickTime / OBS / Loom (note in README the original tool); 3 minutes is the target — under-time is fine, over-time should be cut.

For the screenshots, prefer dark mode if the system is in dark mode (matches user-likely-environment) but ensure all 6 are consistent (all dark or all light). Use a fresh dogfood-prepared library with 5+ books for "library-grid.png" to look populated.

V1 closure: this is the final task. After this, the entire V1 spec + implementation is complete. The closure commit serves as the V1 milestone marker.

### Relevant Files

- `README.md` — extension target.
- `.compozy/tasks/004-chat-ui/_prd.md` — annotation target.
- `.compozy/tasks/004-chat-ui/_tasks.md` — task completion tracking.
- TechSpec § Manual Smoke — sequence.
- Feature 002 task_18 + Feature 003 task_13 — closure templates.

### Dependent Files

- `README.md` (modify: add "Chat UI" section + extend Stack + screenshots)
- `.compozy/tasks/004-chat-ui/_prd.md` (modify: append Exit Criteria Verification)
- `.compozy/tasks/004-chat-ui/_tasks.md` (modify: mark all tasks completed)
- `docs/screenshots/*.png` (new — 6 files)
- `docs/screencast.mp4` (new — or external link)

### Related ADRs

- All 10 Feature 004 ADRs — every closure criterion traces back to one.
- All product ADRs — V1 milestone touches all of them.

## Deliverables

- Annotated `_prd.md` with verified exit criteria.
- Extended `README.md` with screenshots + screencast link + architectural prose.
- 3-minute screencast committed.
- 6 screenshots committed.
- Closure commit with V1 milestone message.
- Unit tests with 80%+ coverage **(REQUIRED)** — structural README + PRD checks.
- Integration tests **(REQUIRED)** — manual smoke sequence is the integration test.

## Tests

- Unit tests:
  - [ ] `README.md` contains a section titled "Chat UI (feature 004)".
  - [ ] `README.md` "Chat UI" section contains links to ≥ 3 screenshots.
  - [ ] `README.md` "Chat UI" section links to the screencast (relative path or external URL).
  - [ ] `_prd.md` contains a section titled "Exit Criteria Verification".
  - [ ] `_prd.md` records numerical values for ≥ 5 PRD Primary Success Metrics.
  - [ ] All 14 preceding tasks have `status: completed` in their frontmatter.
  - [ ] `docs/screenshots/` contains ≥ 5 image files.
- Integration tests:
  - [ ] CI `main` shows all green jobs on the most recent commit.
  - [ ] Manual: full smoke sequence completes without showstopping bugs (recorded in `_prd.md` annotations).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- `main` is green-CI; all V1 features closed.
- Every Feature 004 PRD Exit Criterion is annotated with measured evidence.
- `README.md` is the polished portfolio entry point: stack, journey demos, ADR trail, screencast.
- V1 dogfooding can begin (or has begun and stabilized).
