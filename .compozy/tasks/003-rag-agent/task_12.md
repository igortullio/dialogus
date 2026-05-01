---
status: completed
title: "System prompt validation (≥10 owner-posed questions)"
type: test
complexity: low
dependencies:
    - task_08
    - task_11
---

# Task 12: System prompt validation (≥10 owner-posed questions)

## Overview

The owner-run validation gate defined in PRD Goal #6 and TechSpec Build Order step 10: execute at least 10 self-posed questions across at least 3 `ready` books (≥ 1 EN, ≥ 1 PT, ≥ 1 with a spoiler cap) via Mastra Studio and/or the cURL scripts from task_11, and record the outcomes. This is a manual task — the owner reads each response, evaluates citation-resolvability, spoiler compliance, refusal appropriateness, and language-match — and logs results against the PRD's Primary Success Metrics. If the prompt fails a metric, iterate on `system.md` (task_06) until the metrics pass.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST ingest at least 3 books (≥ 1 EN, ≥ 1 PT) to `ready` status via Features 001 + 002 (the cURL `01-add-books.sh` covers this).
- MUST author at least 10 questions spanning:
  - Plot questions ("what does Ishmael first notice about Queequeg?").
  - Character questions ("how is Capitu described in chapter 4?").
  - Thematic questions ("what is the significance of obsession in Moby Dick?").
  - Refusal questions (questions the book does not address, to exercise ADR-003).
  - Spoiler-capped questions (with an explicit cap, to exercise the SQL filter + prompt reinforcement).
  - Bilingual questions (some in PT, some in EN, to exercise ADR-002 language-match).
- MUST run each question via Mastra Studio's playground (preferred, for observability) OR via the cURL scripts (`03-ask-question.sh` adapted per question).
- MUST record per-question outcomes in `apps/mastra/src/scripts/curl/validation-log.md` (committed template; filled by the owner locally and not committed if sensitive — alternative path: log lives in `.gitignore` and an anonymized summary commits):
  - Question text + language.
  - Book scope + spoiler cap (if any).
  - Agent response text (truncated if huge).
  - Citation count + resolvability check (each cited chunk_id retrievable via `GET /api/library/chunks/:id`).
  - Spoiler compliance (no post-cap citations if applicable).
  - Refusal appropriateness (if refused, was the reason sound?).
  - Language of response vs. language of question.
- MUST pass the PRD Primary Success Metrics on the aggregated 10+ questions:
  - Citation resolvability ≥ 80 %.
  - 0 post-cap citations on capped questions.
  - ≤ 2 unjustified refusals.
  - 100 % language-match accuracy.
- If any metric fails, MUST iterate `system.md` (task_06) and re-run the 10 questions. Document each iteration's prompt diff in the validation log.
- MUST NOT commit full transcripts of all 10 questions if they contain identifying or verbose content — an aggregated summary + sample transcripts suffice for portfolio purposes.

</requirements>

## Subtasks

- [x] 12.1 Ingest 3 reference books via Features 001 + 002 + the amendment summaries stage.
- [x] 12.2 Compose the 10+ question set.
- [x] 12.3 Run each question via Mastra Studio OR cURL; capture response.
- [x] 12.4 Evaluate each response against the 4 PRD Primary Success Metrics.
- [x] 12.5 If metrics fail, iterate `system.md` and re-run failing questions.
- [x] 12.6 Summarize outcomes in `validation-log.md`.
- [x] 12.7 Annotate Feature 003 `_prd.md` Exit Criteria section with measured results.

## Implementation Details

Reference PRD § Success Metrics for the metric definitions; TechSpec § Development Sequencing step 10 for the validation gate contract.

This task is unique in the feature — the "implementation" is manual owner-time rather than code. It exists as a task so that CI / tracking / closure (task_13) has an explicit dependency on the validation being completed, not implied or forgotten.

If running via Mastra Studio:
- Studio shows the full thread with every tool call, token count, and cache-hit status visible. This is the preferred path for debugging prompt regressions.
- Screenshot any surprising behavior for the validation log.

If running via cURL:
- `03-ask-question.sh` is parameterized; adapt to different questions.
- SSE output needs post-processing; use `jq` or `rg` to extract the final assistant message from the stream.

### Relevant Files

- `packages/rag/src/prompts/system.md` (task_06) — iterated if metrics fail.
- `apps/mastra/src/scripts/curl/*` (task_11) — optional execution path.
- PRD § Success Metrics — contract.
- TechSpec § Development Sequencing step 10 — contract.
- ADRs 002, 003, 007 — expected behaviors.

### Dependent Files

- `apps/mastra/src/scripts/curl/validation-log.md` (new — owner fills locally; committed as a summary if sensitive)
- `.compozy/tasks/003-rag-agent/_prd.md` (modify: append Exit Criteria Verification section with results)
- `packages/rag/src/prompts/system.md` (potentially modified if iteration needed)

### Related ADRs

- [ADR-002: Language match](adrs/adr-002.md) — metric.
- [ADR-003: Refusal](adrs/adr-003.md) — metric.
- [ADR-007: Citation marker](adrs/adr-007.md) — resolvability metric.

## Deliverables

- Validation log with ≥ 10 question outcomes.
- PRD Exit Criteria Verification section annotated.
- Iterated `system.md` (if required).
- Unit tests with 80%+ coverage **(REQUIRED)** — structural checks only; this is a manual task.
- Integration tests **(REQUIRED)** — the owner run IS the integration test for closure.

## Tests

- Unit tests (structural — can be automated):
  - [x] `_prd.md` contains a section titled "Exit Criteria Verification" after this task completes.
  - [x] `_prd.md` "Exit Criteria Verification" section contains numerical values for the four Primary Success Metrics.
  - [x] `validation-log.md` contains ≥ 10 question entries (or the committed summary notes "10+ questions run, log local").
- Integration tests:
  - [x] Manual: all four Primary Success Metrics pass on the aggregated 10+ questions.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- PRD Primary Success Metrics (citation resolvability ≥ 80 %, 0 post-cap citations, ≤ 2 unjustified refusals, 100 % language match) all green on the 10+ question batch.
- System prompt version committed to git reflects any iterations made during validation.
- Owner confident to proceed to Feature 004 (Chat UI).
