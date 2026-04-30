---
status: completed
title: Catalog smoke + closure
type: chore
complexity: medium
dependencies:
    - task_13
    - task_14
    - task_15
    - task_16
    - task_17
---

# Task 18: Catalog smoke + closure

## Overview

Run the full cURL smoke sequence from Feature 001 TechSpec § Manual Smoke against a clean environment (fresh clone or `db:reset`), confirm the landing page displays the correct library count, verify all PRD exit criteria with measured evidence, extend the README's API documentation, and annotate the feature PRD's completion. Nothing in Feature 002 begins until this task passes.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST run the manual smoke sequence verbatim from Feature 001 TechSpec § Testing Approach → Manual Smoke.
- MUST add at least 3 books to the library via `POST /api/library/books` with `Idempotency-Key` headers — 2 English + 1 Portuguese at minimum, per Feature 001 PRD Success Metrics.
- MUST verify `http://localhost:3000` shows "livros: 3" (or current count) accurately.
- MUST verify soft-delete → restore round-trip via `DELETE` then `POST /restore`, observing the landing count change in between.
- MUST verify duplicate POST WITHOUT `Idempotency-Key` returns 409 Problem Details with `existing_book_id` extension.
- MUST verify duplicate POST WITH same `Idempotency-Key` returns the cached response verbatim (same status code, same body).
- MUST verify CI green on `main` across all 4 jobs (lint-and-typecheck, test, integration, build) on the most recent commit.
- MUST extend `README.md` with a new "API Problems" section enumerating every Problem Details slug used by catalog endpoints (source: `problem` middleware mapping from task_11).
- MUST extend `README.md` with a new "Catalog (feature 001)" section showing the 4-command cURL onboarding demo (search → add with key → list → delete).
- MUST annotate Feature 001 `_prd.md` with an appended "Exit Criteria Verification" section listing timestamps + counts + observations.
- MUST commit the closure annotation with message `chore(repo): close feature 001-catalog [T018]`.

</requirements>

## Subtasks

- [x] 18.1 Run manual smoke sequence against docker-compose + `pnpm dev`.
- [x] 18.2 Add 3+ books (2 EN + 1 PT); verify landing count.
- [x] 18.3 Test duplicate POST (with and without Idempotency-Key).
- [x] 18.4 Test soft-delete → restore cycle.
- [x] 18.5 Verify CI green on `main`.
- [x] 18.6 Extend README with "API Problems" + "Catalog (feature 001)" sections.
- [x] 18.7 Annotate `_prd.md` with exit-criteria verification block.
- [x] 18.8 Commit closure.

## Manual Validation Methods

This task validates Catalog through three complementary manual methods.

- **Endpoint testing** (cURL / httpie): primary method here. Every assertion is a `curl` invocation with explicit headers (Idempotency-Key, Content-Type) and JSON body. Pipe responses through `jq` for status + envelope inspection. The 4-command demo in README is the canonical sequence.
- **UI verification (Playwright MCP)**: navigate to `http://localhost:3000` after the cURL sequence; assert the landing's "livros: N" matches the library size you just built. Take a screenshot to capture the count visually. Refresh after `DELETE` and `POST /restore` to verify count updates.
- **Output validation**: assertions name specific inputs → expected outputs (e.g., "POST with same Idempotency-Key returns 201 with identical body AND `X-Idempotency-Replay: true` header"). RFC 9457 Problem Details responses checked field-by-field (`type`, `status`, `existing_book_id`).

## Implementation Details

Reference Feature 001 PRD § Goals + § Success Metrics (for numerical targets) and Feature 001 TechSpec § Testing Approach → Manual Smoke (for the command sequence). The 4-command cURL demo in README should be copy-pasteable.

### Relevant Files

- Feature 001 PRD § Goals, § Success Metrics.
- Feature 001 TechSpec § Testing Approach → Manual Smoke.
- `README.md` (from Foundation task_20).
- `apps/api/src/infrastructure/http/middleware/problem.ts` (task_11) — source of slug list.

### Dependent Files

- `README.md` (modify: add API Problems section + Catalog (feature 001) section)
- `.compozy/tasks/001-catalog/_prd.md` (modify: append Exit Criteria Verification)

### Related ADRs

- All feature ADRs: [ADR-001](adrs/adr-001.md), [ADR-002](adrs/adr-002.md), [ADR-003](adrs/adr-003.md), [ADR-004](adrs/adr-004.md), [ADR-005](adrs/adr-005.md) — each exit criterion traces back to one of these.

## Deliverables

- Annotated `_prd.md` with exit-criteria evidence.
- Extended `README.md` with two new sections.
- Green CI on `main` at time of closure.
- Unit tests with 80%+ coverage **(REQUIRED)** — structural checks on README changes + PRD annotation presence.
- Integration tests **(REQUIRED)** — the manual smoke sequence IS the integration test here.

## Tests

- Unit tests:
  - [ ] Feature 001 `_prd.md` contains a section titled "Exit Criteria Verification".
  - [ ] `README.md` contains a section titled "API Problems" enumerating ≥ 7 slugs.
  - [ ] `README.md` contains a section titled "Catalog (feature 001)" with a cURL demo.
- Integration tests:
  - [ ] Manual smoke: `curl POST /api/library/books` with Idempotency-Key `X` returns 201.
  - [ ] Repeat with same key + body → 201 with identical body AND `X-Idempotency-Replay: true` header.
  - [ ] Same key, different body → 422 Problem Details `idempotency-key-conflict`.
  - [ ] Duplicate `gutendex_id` without Idempotency-Key → 409 Problem Details `duplicate-gutendex-id` with `existing_book_id` extension.
  - [ ] `DELETE /api/library/books/:id` → 204; `GET /api/library/books` excludes it.
  - [ ] `POST /api/library/books/:id/restore` → 200 envelope; `GET /api/library/books` includes it again.
  - [ ] Landing `http://localhost:3000` shows "livros: N" matching the current library size.
  - [ ] CI on `main` shows 4 jobs all green on latest commit.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Every Feature 001 PRD exit criterion is annotated with measured or observed evidence.
- `main` is green-CI and ready for Feature 002 (book-ingestion) planning to begin.
