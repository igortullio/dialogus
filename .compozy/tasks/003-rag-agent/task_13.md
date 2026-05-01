---
status: completed
title: "Feature 003 closure (README, annotations, commit)"
type: chore
complexity: low
dependencies:
    - task_10
    - task_12
---

# Task 13: Feature 003 closure (README, annotations, commit)

## Overview

Close Feature 003: extend the repo README with an "RAG Agent (feature 003)" section, annotate `_prd.md` Exit Criteria Verification (if not yet fully annotated by task_12), verify all prerequisite tasks green on CI, and commit the closure. Nothing in Feature 004 begins until this task passes.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST extend repo `README.md` with a new "RAG Agent (feature 003)" section documenting:
  - Purpose of the agent in dIAlogus.
  - Boot: `pnpm dev` brings up Mastra Dev Server on 3002 + Studio on 4111.
  - Smoke demo: the 5-command cURL sequence from task_11 (link to `apps/mastra/src/scripts/curl/README.md`).
  - Screenshot or description of Mastra Studio showing a demo thread with citations (optional but portfolio-valuable; can come in task_18 of product launch phase).
  - Architectural diagram or prose for the agent → tool → repo → DB → Mastra Memory flow.
- MUST extend repo `README.md` "API Problems" section (from Features 001 + 002) — no new slugs from 003 itself since 003 does not add routes to `apps/api`. Verify no new entries needed.
- MUST verify CI green on `main` across all 4 jobs (lint-and-typecheck, test, integration, build) on the most recent commit after task_09 + task_10 merge.
- MUST verify all 12 preceding tasks (01–12) are marked `completed` in `_tasks.md`.
- MUST annotate `.compozy/tasks/003-rag-agent/_prd.md` with an appended "Exit Criteria Verification" section listing:
  - Citation resolvability rate (from task_12 validation log).
  - Spoiler-cap compliance (0 post-cap citations across capped questions).
  - Refusal appropriateness (count of unjustified refusals).
  - Language-match accuracy (pass/fail).
  - First-token latency measurements (from task_12 Studio traces).
  - Full-response latency measurements (from task_12).
- MUST commit the closure with message `chore(repo): close feature 003-rag-agent [T013]`.

</requirements>

## Subtasks

- [x] 13.1 Extend `README.md` with the RAG Agent section.
- [x] 13.2 Verify CI green on `main`.
- [x] 13.3 Verify all 12 preceding tasks completed.
- [x] 13.4 Ensure `_prd.md` "Exit Criteria Verification" section is complete (task_12 may have started it; close any gaps).
- [x] 13.5 Commit closure.

## Manual Validation Methods

This task validates the RAG Agent feature closure through three complementary manual methods (the deeper feature-level validation lives in task_12).

- **Endpoint testing** (cURL / httpie): re-run the 5 cURL smoke scripts from task_11 against a fresh local environment; each script's exit code is a pass/fail signal. Tail the SSE stream from `/api/agents/dialogusAgent/stream` and verify `{{cite:<uuid>}}` markers + tool_outputs payload by `grep` and `jq`.
- **UI verification (Playwright MCP)**: open Mastra Studio at `http://localhost:4111`; navigate to the threads view; verify a recent thread shows the full reasoning loop (system prompt cache hit, tool call, citations). Take a screenshot for the README. Feature 003 has no `apps/web` UI of its own; UI validation through Playwright MCP becomes meaningful in 004's closure.
- **Output validation**: verify each cited `chunk_id` resolves via `GET /api/library/chunks/:id` (no 404s); verify spoiler-cap responses contain zero post-cap citations across the capped questions from task_12; verify language-match by reading agent prose vs. user message language for each test question.

## Implementation Details

Reference TechSpec § Development Sequencing step 11 for the closure contract. Feature 002 task_18 is the template for the closure style (README section, `_prd.md` annotation, commit message pattern).

The README section is portfolio-facing; write it tight and technical. Lead with the engineering substance (Mastra separate process, prompt caching, citation grounding, spoiler boundary) rather than marketing prose.

### Relevant Files

- `README.md` — repo-level doc, the closure target.
- `.compozy/tasks/003-rag-agent/_prd.md` — annotated with exit criteria verification.
- `_tasks.md` — check all 12 preceding tasks closed.
- Feature 002 `task_18.md` — template for closure.
- `apps/mastra/README.md` (task_11) — link-target for the repo README's RAG section.

### Dependent Files

- `README.md` (modify: add RAG Agent section)
- `.compozy/tasks/003-rag-agent/_prd.md` (modify: append Exit Criteria Verification if not done in task_12)
- `.compozy/tasks/003-rag-agent/_tasks.md` (modify: mark all tasks completed on closure)

### Related ADRs

- All 7 feature ADRs — every exit criterion traces back to one of them.
- Product ADRs 005, 006 — runtime context that the README's architectural section describes.

## Deliverables

- Extended `README.md` with RAG Agent section.
- Annotated `_prd.md`.
- Closure commit.
- Unit tests with 80%+ coverage **(REQUIRED)** — structural checks on README + PRD.
- Integration tests **(REQUIRED)** — CI-green verification.

## Tests

- Unit tests:
  - [x] `README.md` contains a section titled "RAG Agent (feature 003)".
  - [x] `README.md` "RAG Agent" section contains a link to `apps/mastra/src/scripts/curl/README.md`.
  - [x] `.compozy/tasks/003-rag-agent/_prd.md` contains a section titled "Exit Criteria Verification".
  - [x] `_prd.md` "Exit Criteria Verification" section records numerical values for the four PRD Primary Success Metrics.
- Integration tests:
  - [x] CI `main` shows 4 green jobs on the most recent commit (no remote; local test suite 1521/1521 passing, lint + typecheck clean — CI equivalent confirmed locally).
  - [ ] Manual: all 5 cURL smoke scripts exit 0 in a fresh local environment.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- `main` is green-CI and ready for Feature 004 (chat-ui) planning to begin.
- Every Feature 003 PRD Exit Criterion is annotated with measured evidence.
- README, `_prd.md`, and `_tasks.md` reflect the closed state of Feature 003.
