---
status: completed
title: Worker registration for summarize queue + integration suite extension
type: backend
complexity: medium
dependencies:
  - task_15
  - task_23
---

# Task 24: Worker registration for summarize queue + integration suite extension

## Overview

Extend `apps/worker` to register the new `ingestion.summarize` pg-boss queue handler (wiring the use case from task_23 + the Anthropic generator adapter from task_22), and grow the ingestion integration test suite to exercise the full seven-stage pipeline (download → clean → parse → chunk → **summarize** → embed → index) against Testcontainers with MSW-mocked Anthropic. Updates the manual-smoke documentation in `apps/worker/README.md`.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add `apps/worker/src/handlers/ingestion-summarize.ts` that wires the `summarize` use case (task_23) with injected dependencies:
  - Drizzle-backed `ChapterRepository`, `ChapterSummaryRepository`.
  - `AnthropicChapterSummaryGenerator` instance (singleton across job invocations).
  - pg-boss instance for enqueuing `ingestion.embed`.
  - Structured logger with `stage: 'summarize'` field pre-bound.
- MUST register the handler in `apps/worker/src/index.ts` via `boss.work('ingestion.summarize', { teamConcurrency: 1 }, summarizeHandler)`. Matches the serial policy of feature ADR-002.
- MUST update `apps/worker/.env.example` to document `ANTHROPIC_API_KEY` as required at runtime.
- MUST update the existing `ingestion-happy.integration.test.ts` (from task_16) to reflect the new 7-stage pipeline: MSW fixtures for Anthropic summary responses; assert 5 chapter_summaries rows exist alongside expected chapter/chunk counts.
- MUST update the existing `ingestion-retry.integration.test.ts` (from task_16) to test at least one retry scenario where the summarize stage fails: induce `MockChapterSummaryGenerator` to throw on a specific chapter, assert `books.ingestion_status = 'failed'`, call retry, assert resume completes remaining summaries + embed + index.
- MUST add a new `summarize-language.integration.test.ts` integration test: ingests one EN book and one PT book end-to-end; asserts each `chapter_summaries.summary` contains language-consistent tokens (e.g., common function words from the corresponding language appear in ≥ 80% of summaries).
- MUST update `apps/worker/README.md` (or create if not yet present) documenting the full seven-stage flow, including the summarize stage.

</requirements>

## Subtasks

- [x] 24.1 Add `ingestion-summarize.ts` handler.
- [x] 24.2 Register handler in `apps/worker/src/index.ts`.
- [x] 24.3 Update `apps/worker/.env.example`.
- [x] 24.4 Update existing integration tests (`ingestion-happy`, `ingestion-retry`) for the new pipeline shape.
- [x] 24.5 Add `summarize-language.integration.test.ts`.
- [x] 24.6 Update `apps/worker/README.md`.

## Implementation Details

Worker scripts receive the Anthropic generator instance by composition, not inside the handler. Construct it once in `apps/worker/src/index.ts` during boot so the `bottleneck` limiter + prompt-cache state survive across jobs. Pass the instance to the handler factory.

The language-consistency integration test is intentionally loose ("common function words in ≥ 80% of summaries") rather than strict regex for real PT or EN words — the Mock generator is used, so its output is deterministic-from-input. Assertion shape: run `MockChapterSummaryGenerator` with a fixture PT chapter; assert the mock's deterministic output includes the `language: 'pt'` marker it emits. This validates the plumbing (language correctly flowed from `books.languages[0]` → use case → generator) without asserting LLM quality.

### Relevant Files

- Feature 002 ADR-008: [Stage + worker-registration requirement](adrs/adr-008.md).
- `apps/worker/src/index.ts` (task_15 — extend handler registration).
- `apps/worker/src/handlers/ingestion-*.ts` (task_15 — templates for new handler).
- `apps/api/__tests__/integration/ingestion-happy.integration.test.ts` (task_16 — update).
- `apps/api/__tests__/integration/ingestion-retry.integration.test.ts` (task_16 — update).

### Dependent Files

- `apps/worker/src/handlers/ingestion-summarize.ts` (new)
- `apps/worker/src/index.ts` (modify: register)
- `apps/worker/.env.example` (modify)
- `apps/worker/README.md` (new or modify)
- `apps/api/__tests__/integration/ingestion-happy.integration.test.ts` (modify)
- `apps/api/__tests__/integration/ingestion-retry.integration.test.ts` (modify)
- `apps/api/__tests__/integration/summarize-language.integration.test.ts` (new)

### Related ADRs

- [Feature 002 ADR-008](adrs/adr-008.md)
- [Feature 002 ADR-002](adrs/adr-002.md) — serial concurrency inherited.
- [Feature 002 ADR-005](adrs/adr-005.md) — worker as sole pg-boss consumer.

## Deliverables

- New worker handler registered.
- `.env.example` updated.
- 2 existing integration tests updated + 1 new integration test.
- `apps/worker/README.md` updated.
- Unit tests with 80%+ coverage **(REQUIRED)** — handler factory smoke.
- Integration tests **(REQUIRED)**.

## Tests

- Unit tests:
  - [ ] Handler factory composes dependencies correctly (mocked ports → assert `boss.work` called with expected shape).
- Integration tests (Testcontainers + MSW-mocked Anthropic):
  - [ ] `ingestion-happy.integration.test.ts` updated: full 7-stage pipeline → `chapter_summaries` has N rows where N = chapter count.
  - [ ] `ingestion-retry.integration.test.ts` updated: induced summarize failure → retry resumes → full pipeline completes.
  - [ ] `summarize-language.integration.test.ts` new: EN + PT books both summarize; mock output reflects language param.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- `pnpm dev` boots `apps/worker` with the new handler registered; `/health` on `apps/api` shows worker pg-boss queues including `ingestion.summarize`.
- CI integration job duration stays under the 15-minute wall-clock budget despite the added test.
- `apps/worker/README.md` is the single source of truth for the pipeline shape after this task (matches ADR-008's definitive sequence).
