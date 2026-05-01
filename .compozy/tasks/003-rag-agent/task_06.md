---
status: completed
title: "System prompt Markdown asset + snapshot test"
type: backend
complexity: low
dependencies:
  - task_01
---

# Task 06: System prompt Markdown asset + snapshot test

## Overview

Author the committed Markdown system prompt at `packages/rag/src/prompts/system.md` per TechSpec § Core Features #3 and PRD ADRs 002/003/007. The prompt defines identity, grounding contract, citation format, language-match rule, refusal template, and spoiler-cap reinforcement. Ship a snapshot-style test that asserts the prompt stays under 2000 tokens and contains the required sections, so regressions surface in CI.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/rag/src/prompts/system.md` as a committed Markdown asset. The prompt MUST include (headings or unambiguous sections):
  - **Identity / posture**: scholarly, neutral, cited; never adopts character voice (product ADR-002).
  - **Grounding contract**: always call `semantic_search` before substantive answers; never answer book-specific questions from pre-training alone.
  - **Citations**: emit `{{cite:<chunk_id>}}` inline after every non-trivial claim; `chunk_id` must be a UUID from `semantic_search` `tool_output`; never invent IDs.
  - **Language match**: respond in the language of the user's latest message; quotes retain source language.
  - **Refusal + reformulation**: on empty retrieval, abstain from the substantive question and offer 2–3 reformulation hints drawn from `list_chapters` output or visible chapter titles.
  - **Spoiler cap**: if a chunk above the cap somehow surfaces, treat it as invisible; never quote or paraphrase it.
  - **Tool usage guidance**: summary of the four tools' purposes and when to call which.
- MUST create `packages/rag/src/prompts/loader.ts` exporting `loadSystemPrompt(): string` that reads the file at import time (Node `readFileSync`), caches the result in a module-level variable, returns it. The loader is synchronous; called once per process.
- MUST create `packages/rag/__tests__/prompts/system.test.ts` snapshot-style:
  - Assert file exists.
  - Assert token count (via `js-tiktoken` cl100k_base encoding) is in `[500, 2000]` inclusive. Upper bound per PRD Success Metrics (≤ 2000 tokens); lower bound prevents accidental truncation.
  - Assert six required sections are present via keyword presence (`/identity|posture/i`, `/grounding|semantic_search/i`, `/citation|\{\{cite/`, `/language|idioma/i`, `/refusal|reformulation|recusa/i`, `/spoiler|cap|cap[íi]tulo/i`).
  - Assert no TODO or FIXME markers.
  - Assert the citation marker appears in the prompt in its canonical form (`{{cite:<chunk_id>}}`) as part of its instruction.
- MUST NOT include any example responses that look like real book content (could confuse the model); examples are schematic (`{{cite:abc-123}}`, etc.).
- The prompt asset is PR-reviewable as Markdown; no binary or generated content.

</requirements>

## Subtasks

- [x] 6.1 Author `system.md` covering all six sections.
- [x] 6.2 Author `loader.ts` with cached `readFileSync` + singleton.
- [x] 6.3 Author the snapshot-style test.
- [x] 6.4 Verify token count within `[500, 2000]`; iterate wording if over budget.

## Implementation Details

Reference feature 003 ADRs 002 (language match), 003 (refusal behavior), 007 (citation format) for the content specifications. The prompt is the primary artifact the owner iterates during the task_12 validation round; writing it tight now reduces the number of back-and-forth edits later.

Keep the prompt in English even though agent responses vary by language — the system prompt itself is an instruction to the LLM, not user-visible copy. Instructions in English work reliably across Claude 4.x models; mixing PT + EN in the prompt is not known to improve behavior.

`js-tiktoken` is already added as a workspace dep via Feature 002 task_08; the loader reuses it.

### Relevant Files

- `packages/rag/src/domain/constants/citation.ts` (task_01) — regex constant referenced in the prompt's citation section (optional cross-reference; prompt can use literal `{{cite:<chunk_id>}}` as string).
- ADRs 002, 003, 007 — authoritative content specifications.
- `packages/ingestion/src/infrastructure/parsing/chapter-heuristics.yaml` (Feature 002 task_08) — example of committed asset pattern.

### Dependent Files

- `packages/rag/src/prompts/system.md` (new)
- `packages/rag/src/prompts/loader.ts` (new)
- `packages/rag/src/index.ts` (modify: barrel exports `loadSystemPrompt`)
- `packages/rag/__tests__/prompts/system.test.ts` (new)
- `packages/rag/tsconfig.json` (verify `resolveJsonModule` + asset inclusion; `.md` files read via `readFileSync` do not need tsconfig changes but the build must copy them — verify `package.json` `files` or `publishConfig` includes `src/prompts/*.md`)

### Related ADRs

- [ADR-002: Language-match](adrs/adr-002.md) — prompt instruction authored here.
- [ADR-003: Refusal + reformulation](adrs/adr-003.md) — prompt instruction authored here.
- [ADR-007: Citation marker format](adrs/adr-007.md) — prompt instruction authored here.

## Deliverables

- `system.md` prompt asset.
- `loader.ts` with singleton caching.
- Snapshot test in the `__tests__/` directory.
- Unit tests with 80%+ coverage **(REQUIRED)** — the snapshot test IS the unit coverage for the prompt asset.
- Integration tests **(REQUIRED)** — deferred to task_09 (`agent-conversation.integration.test.ts` exercises the prompt via the agent).

## Tests

- Unit tests:
  - [x] `loadSystemPrompt()` returns a non-empty string.
  - [x] Token count ≥ 500 and ≤ 2000 (via `js-tiktoken.encode(...).length`).
  - [x] Prompt contains the 6 required sections (regex match each).
  - [x] Prompt contains the literal substring `{{cite:` at least once.
  - [x] Prompt contains no `TODO` or `FIXME` (case-insensitive).
  - [x] `loadSystemPrompt()` called twice returns the same reference (cached).
- Integration tests:
  - [x] Deferred to task_09 — agent-conversation test uses the real loaded prompt.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Prompt is ≤ 2000 tokens (PRD Success Metric)
- Prompt is PR-reviewable Markdown — no generated content, no binary
- The six required sections are present and match the ADR-defined contracts
