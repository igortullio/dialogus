---
status: completed
title: Ingestion smoke + closure
type: chore
complexity: medium
dependencies:
    - task_14
    - task_15
    - task_16
    - task_17
    - task_24
---

# Task 18: Ingestion smoke + closure

## Overview

Run the manual smoke sequence defined in the Feature 002 TechSpec against a clean environment, verify all PRD exit criteria with measured evidence, extend the README with an "Ingestion (feature 002)" section, annotate `_prd.md` with verified completion, and commit the closure. Nothing in Feature 003 begins until this task passes.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST run the manual smoke sequence verbatim from Feature 002 TechSpec § Testing Approach → Manual Smoke.
- MUST ingest ≥ 3 books (Moby Dick + Dom Casmurro + Crime and Punishment or equivalent substitutes; 2 EN + 1 PT minimum per PRD Success Metrics) to `ready` state via cURL.
- MUST verify `http://localhost:3000` shows "livros: 3 (prontos: 3)" (or the matching counts).
- MUST force a failure (e.g., temporarily set `OPENAI_API_KEY=invalid` or unplug network mid-embed) to observe `failed` status + structured error message; call `/ingest/retry` and verify resume.
- MUST ingest one large book (War and Peace, Les Misérables, or similar > 300k words) to `ready` without OOM.
- MUST verify `GET /api/library/chunks/:id` returns correct excerpt + chapter metadata for a sample chunk.
- MUST verify every `ready` book has a row in `chapter_summaries` for every row in `chapters` (ADR-008 invariant). Query: `SELECT COUNT(*) FROM chapters c WHERE c.book_id = '<id>' AND NOT EXISTS (SELECT 1 FROM chapter_summaries s WHERE s.chapter_id = c.id)` must return 0 for each ingested book.
- MUST verify the per-stage progress visibly transitions through `summarizing` during ingestion of at least one book (observable via `GET /api/library/books/:id/ingestion` polling).
- MUST verify CI green on `main` across 4 jobs (lint-and-typecheck, test, integration, build) on the most recent commit.
- MUST extend `README.md` with an "Ingestion (feature 002)" section showing a 6-command cURL onboarding demo (catalog add → ingest → poll → view chunk).
- MUST extend `README.md` "API Problems" section with the 7 new slugs from task_01.
- MUST annotate Feature 002 `_prd.md` with an appended "Exit Criteria Verification" section listing timestamps + counts + observations (memory footprint for the large book, wall-clock per stage for at least one book, retry recovery time).
- MUST commit the closure with message `chore(repo): close feature 002-ingestion [T018]`.

</requirements>

## Subtasks

- [x] 18.1 Fresh-env smoke sequence.
- [x] 18.2 Ingest 3 books (2 EN + 1 PT).
- [x] 18.3 Test retry path with induced failure.
- [x] 18.4 Test large-book ingestion path.
- [x] 18.5 Verify CI green on `main`.
- [x] 18.6 Extend README with Ingestion section + API Problems update.
- [x] 18.7 Annotate `_prd.md` with Exit Criteria Verification.
- [x] 18.8 Commit closure.

## Manual Validation Methods

This task validates Ingestion through three complementary manual methods.

- **Endpoint testing** (cURL / httpie): kick off ingestion via `POST /api/library/books/:id/ingest`, poll `GET /api/library/books/:id/ingestion` every 2-3 seconds via a small bash loop, capture stage transitions in a log. After `ready`, fetch a sample chunk via `GET /api/library/chunks/:id` and inspect text + chapter context.
- **UI verification (Playwright MCP)**: navigate to `http://localhost:3000`; verify the landing's "livros: X (prontos: N)" updates as books transition to `ready`. Take screenshots at three stages (mid-parse, mid-embed, ready) to document the lifecycle visually.
- **Output validation**: assert `chapter_summaries` invariant via direct SQL or `/api/library/chunks/:id` response (every `ready` book has summaries for all chapters); assert HNSW index exists via `\d+ chunks` in psql; assert `ingestion_status` enum sequence matches the seven-stage chain (`download → clean → parse → chunk → summarize → embed → index`).

## Implementation Details

Reference Feature 002 PRD § Goals + § Success Metrics (numerical targets) and Feature 002 TechSpec § Testing Approach → Manual Smoke (command sequence). Use `/usr/bin/time -l` or equivalent to capture peak memory for the large-book ingestion.

### Relevant Files

- Feature 002 PRD.
- Feature 002 TechSpec § Testing Approach.
- `README.md` (updated by Foundation + Catalog closures).
- `apps/api/src/infrastructure/http/middleware/problem.ts` (source of slug inventory).

### Dependent Files

- `README.md` (modify: add Ingestion section + extend API Problems)
- `.compozy/tasks/002-ingestion/_prd.md` (modify: append Exit Criteria Verification)

### Related ADRs

- All 7 feature ADRs — every exit criterion traces back to one of them.

## Deliverables

- Annotated `_prd.md` with exit-criteria evidence.
- Extended `README.md` (Ingestion section + API Problems).
- Green CI on `main`.
- 3+ ingested books + 1 large book in local DB.
- Unit tests with 80%+ coverage **(REQUIRED)** — structural README + PRD annotation checks.
- Integration tests **(REQUIRED)** — the manual smoke sequence IS the integration test for closure.

## Tests

- Unit tests:
  - [x] Feature 002 `_prd.md` contains a section titled "Exit Criteria Verification".
  - [x] `_prd.md` records memory footprint for the large-book ingestion (text matches pattern like "peak RSS ~N MB").
  - [x] `_prd.md` records wall-clock duration for at least one ingestion (stage breakdown).
  - [x] `README.md` contains a section titled "Ingestion (feature 002)" with a cURL demo covering POST /ingest + GET /ingestion + GET /chunks.
  - [x] `README.md` "API Problems" section includes the 8 new slugs (book-not-in-discovered-state, book-not-in-retryable-state, book-already-ready, ingestion-download-failed, ingestion-parse-failed, ingestion-summarize-failed, ingestion-embed-failed, chunk-not-found).
- Integration tests (the smoke sequence):
  - [x] Fresh-env reach: 3 books reach `ready` after full pipeline via cURL + polling.
  - [x] Landing shows accurate `livros: 3 (prontos: 3)`.
  - [x] Induced embed failure → `ingestion_status = 'failed'` with `ingestion_error` populated.
  - [x] `/ingest/retry` resumes from embed; no re-download (verify by confirming file mtime unchanged); no re-embed of successful chunks.
  - [x] Large book (War and Peace or similar): `ready` reached; peak RSS < 500 MB measured externally.
  - [x] `GET /api/library/chunks/<id>` returns envelope with `chapter_title` + `text`.
  - [x] CI `main` shows 4 green jobs on latest commit.
- Test coverage target: >=80% (applies to structural checks; smoke is manual-verified)
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Every Feature 002 PRD exit criterion is annotated with measured or observed evidence.
- Every `ready` book's chapters have a corresponding `chapter_summaries` row (ADR-008 invariant).
- `main` is green-CI and ready for Feature 003 (rag-agent) planning to begin.
