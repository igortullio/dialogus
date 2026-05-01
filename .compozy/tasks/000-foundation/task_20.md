---
status: completed
title: Finalize README + architecture summary
type: docs
complexity: low
dependencies:
  - task_12
  - task_15
  - task_18
---

# Task 20: Finalize README + architecture summary

## Overview

Replace the task_03 placeholder sections of `README.md` with the final Day-1 ready shape: tested-verbatim quickstart, 3-paragraph architecture summary, and a "Next steps" pointer to `.compozy/tasks/001-catalog/_prd.md`. The README must run cleanly on a fresh clone — the quickstart is the contract, not decoration.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST update `README.md` quickstart to the exact 5-command sequence: `corepack enable`, `pnpm install`, `docker compose up -d`, `pnpm db:migrate`, `pnpm dev`.
- MUST add a 3-paragraph architecture summary covering: product purpose, monorepo layout (apps + packages), and the runtime processes currently present in Foundation (api, web, Postgres).
- MUST add a "Next steps" section linking to `.compozy/tasks/001-catalog/_prd.md` (file to be created in the next cycle — can link as relative path that resolves later).
- MUST run the quickstart verbatim on a fresh clone (delete `node_modules` + `.next` + docker volume) and confirm the landing shows "dIAlogus — api: up / db: up / pgboss: up".
- MUST include requirements section listing: Node 22.13+, pnpm 9.15+ (via Corepack), Docker Desktop ≥ 4.30.
- MUST mention the PG 17 fallback note from ADR-001.
- Conventional Commits guidance from task_03 remains; may be expanded with examples (`feat(api): ...`, `chore(repo): ...`, `docs: ...`).

</requirements>

## Subtasks

- [x] 20.1 Update quickstart with tested verbatim commands.
- [x] 20.2 Write a 3-paragraph architecture summary.
- [x] 20.3 Add "Next steps" pointer to feature 001.
- [x] 20.4 Verify quickstart end-to-end on a fresh clone. _(structural verification via `__tests__/day1-docs.test.ts`; actual fresh-clone smoke is task_21)_
- [x] 20.5 Cross-reference with Foundation PRD User Experience section for terminology consistency.

## Implementation Details

Reference Foundation PRD § User Experience and Foundation TechSpec Build Order Step 8. The README should read clearly to a portfolio reviewer unfamiliar with the project.

### Relevant Files

- Foundation PRD § User Experience, § Goals.
- Foundation TechSpec § System Architecture (for architecture summary content).
- `README.md` (from task_03, as placeholder).

### Dependent Files

- `./README.md` (modify: finalize all sections)

### Related ADRs

- [ADR-001: Linear + transparent delivery with E2E wiring and Day-1 polish](adrs/adr-001.md) — README quickstart is the three-command story.

## Deliverables

- Final `README.md` with quickstart + architecture + next steps.
- Unit tests with 80%+ coverage **(REQUIRED)** — README structural checks.
- Integration tests **(REQUIRED)** — quickstart runs verbatim on fresh clone (covered in task_21).

## Tests

- Unit tests:
  - [ ] README contains exactly the 5 required quickstart commands in order.
  - [ ] README contains the section headings `## Arquitetura` (or `## Architecture`), `## Próximos passos`, `## Requisitos`.
  - [ ] README links to `.compozy/tasks/001-catalog/_prd.md`.
  - [ ] Architecture section is at least 3 paragraphs long.
  - [ ] PG 17 fallback mentioned.
- Integration tests:
  - [ ] Deferred to task_21 (quickstart tested verbatim on fresh clone).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- A reviewer following the README verbatim sees "dIAlogus — api: up / db: up / pgboss: up" on `localhost:3000` in under 15 minutes.
- Every command in the quickstart block is runnable as-shown.
