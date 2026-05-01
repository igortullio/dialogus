---
status: completed
title: Write Day-1 documentation files
type: docs
complexity: low
dependencies:
  - task_01
---

# Task 3: Write Day-1 documentation files

## Overview

Ship the first-commit documentation artifacts required by the Day-1 ready polish scope from ADR-001: a README with quickstart placeholder (finalized in task_20), a `LICENSE` (MIT), and a `.env.example` listing every planned env var across all 5 features. These signal portfolio-grade intent on the first commit.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `LICENSE` with MIT text, correct year (2026), and owner name.
- MUST create `README.md` with: 5-line quickstart (`pnpm install && docker compose up -d && pnpm db:migrate && pnpm dev`), short product one-liner ("Single-user RAG study companion over public-domain classics"), Node/pnpm/Docker requirements, placeholder sections for Architecture and Next Steps (filled in by task_20).
- MUST create `.env.example` listing every env var planned across all 5 features with inline comments identifying the consuming feature: `DATABASE_URL`, `NODE_ENV`, `API_PORT`, `WEB_PORT`, `NEXT_PUBLIC_API_URL`, `LOG_LEVEL`, `ANTHROPIC_API_KEY` (feature 003), `OPENAI_API_KEY` (feature 002), `NEXT_PUBLIC_MASTRA_URL` (feature 003).
- README MUST cite Conventional Commits as the project's commit message convention.
- MUST NOT install `commitlint` or any automation enforcing commit message style (deferred to Phase 2 per ADR-001).

</requirements>

## Subtasks

- [x] 3.1 Author `LICENSE` with MIT text.
- [x] 3.2 Draft `README.md` with quickstart, one-liner, requirements, and placeholders for Architecture + Next Steps.
- [x] 3.3 Author `.env.example` enumerating all planned env vars with per-variable comments.
- [x] 3.4 Cross-reference README quickstart commands against TechSpec Build Order Step 1-6.

## Implementation Details

Reference TechSpec "User Experience → Primary flow — first-time clone" for the quickstart command sequence. README layout follows the structure suggested by the Foundation market research (quickstart ≤ 5 lines, architecture narrative, next steps).

### Relevant Files

- `/Users/igortullio/Developer/igortullio/m5nita/README.md` — structural template.
- Product TechSpec env section at `../dialogus/_techspec.md` — source list of env vars per feature.
- Foundation PRD § Day-1 polish requirements.

### Dependent Files

- `./README.md` (new, placeholder shape; finalized in task_20)
- `./LICENSE` (new)
- `./.env.example` (new)

### Related ADRs

- [ADR-001: Linear + transparent delivery with E2E wiring and Day-1 polish](adrs/adr-001.md) — README + LICENSE + `.env.example` are core Day-1 deliverables.

## Deliverables

- `README.md` with quickstart + placeholders.
- `LICENSE` (MIT).
- `.env.example` complete for all 5 features.
- Unit tests with 80%+ coverage **(REQUIRED)** — structural validation that required fields and keys are present.
- Integration test **(REQUIRED)** — covered by task_21 fresh-clone smoke.

## Tests

- Unit tests:
  - [ ] `README.md` contains the exact 5-line quickstart block matching the PRD User Experience flow.
  - [ ] `LICENSE` contains "MIT" and year 2026.
  - [ ] `.env.example` contains every mandated key: `DATABASE_URL`, `NODE_ENV`, `API_PORT`, `WEB_PORT`, `NEXT_PUBLIC_API_URL`, `LOG_LEVEL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `NEXT_PUBLIC_MASTRA_URL`.
  - [ ] Every key in `.env.example` has an inline comment indicating the consuming feature.
- Integration tests:
  - [ ] Deferred to task_21 (README quickstart runs verbatim on a fresh clone).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `.env.example` covers every env var referenced by the product TechSpec.
- README quickstart matches the exact command sequence in the PRD.
