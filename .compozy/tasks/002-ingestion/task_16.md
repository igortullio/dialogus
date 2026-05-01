---
status: completed
title: Integration test suites + CI integration job extension
type: infra
complexity: high
dependencies:
  - task_14
  - task_15
---

# Task 16: Integration test suites + CI integration job extension

## Overview

Author the 5 integration test suites defined in the TechSpec (migration-0003, ingestion-happy, ingestion-retry, ingestion-large-book, chunks-read), each running against Testcontainers Postgres + pgvector with MSW-mocked external services. Extend the CI `integration` job (from Feature 001) to run them; ensure CI stays under ~15 min wall-clock.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST author `apps/api/__tests__/integration/migration-0003.integration.test.ts` — applies `0000_init` + `0001_books` + `0002_idempotency_keys` + `0003_chapters_chunks` on fresh Testcontainers Postgres; asserts: `chapters` + `chunks` tables exist, HNSW index `chunks_embedding_hnsw_idx` exists, partial index on `chunks(book_id) WHERE embedding IS NULL` exists, CHECK on `books.ingestion_progress` is enforced, pgvector `vector(1536)` type is operational (insert + select a test vector).
- MUST author `apps/api/__tests__/integration/ingestion-happy.integration.test.ts` — full 6-stage pipeline on a small fixture EPUB via MSW (Gutendex) + Mock embedding + Testcontainers Postgres; asserts final `books.ingestion_status = 'ready'`, chapter count > 0, chunk count > 0, every chunk has non-null embedding. Wall-clock budget: ≤ 30 s.
- MUST author `apps/api/__tests__/integration/ingestion-retry.integration.test.ts` — induce failure mid-embed (mock provider throws once), verify `books.ingestion_status = 'failed'`, call `POST /ingest/retry`, assert recovery completes without re-downloading (mocked downloader call count = 1) and without re-embedding already-embedded chunks (verify by capturing Mock provider call sizes).
- MUST author `apps/api/__tests__/integration/ingestion-large-book.integration.test.ts` — generate synthetic 400k-token fixture at test setup (plain text with ≥ 50 chapters, 50k tokens each); run full pipeline; assert `ready` state; run test with `--max-old-space-size=200` (or the Vitest equivalent) to assert memory discipline. Wall-clock budget: ≤ 90 s.
- MUST author `apps/api/__tests__/integration/chunks-read.integration.test.ts` — after ingesting a small fixture book, `GET /api/library/chunks/:id` returns envelope with chapter metadata; 404 on unknown id.
- MUST ensure `apps/api/vitest.integration.config.ts` include pattern captures all new suites (may already be `**/*.integration.test.ts` catchall from Feature 001).
- MUST extend `.github/workflows/ci.yml` if any new scripts or services are needed; increase timeout if total wall-clock projects near the 15-min ceiling.
- Tests use the `MockEmbeddingProvider` exclusively; no test calls real OpenAI.

</requirements>

## Subtasks

- [x] 16.1 Author `migration-0003.integration.test.ts`.
- [x] 16.2 Author `ingestion-happy.integration.test.ts`.
- [x] 16.3 Author `ingestion-retry.integration.test.ts`.
- [x] 16.4 Author `ingestion-large-book.integration.test.ts` + synthetic fixture generator.
- [x] 16.5 Author `chunks-read.integration.test.ts`.
- [x] 16.6 Verify CI green end-to-end on a branch push.

## Implementation Details

Reference Feature 002 TechSpec § Testing Approach → Integration Tests for each suite's scope and acceptance checks. The test harness builds on Feature 001 task_17's `integration` CI job and per-suite Testcontainers pattern.

### Relevant Files

- Feature 001 task_16 `apps/api/__tests__/integration/` suite patterns (from catalog) + `vitest.integration.config.ts`.
- Feature 002 TechSpec § Testing Approach.
- All ingestion stage handlers (tasks 10-13) + apps/worker boot (task_15) + routes (task_14).
- `packages/ingestion/__fixtures__/` — EPUB + TXT fixtures committed across tasks 6, 7, 8, 9.

### Dependent Files

- `apps/api/__tests__/integration/migration-0003.integration.test.ts` (new)
- `apps/api/__tests__/integration/ingestion-happy.integration.test.ts` (new)
- `apps/api/__tests__/integration/ingestion-retry.integration.test.ts` (new)
- `apps/api/__tests__/integration/ingestion-large-book.integration.test.ts` (new)
- `apps/api/__tests__/integration/chunks-read.integration.test.ts` (new)
- `apps/api/__tests__/integration/fixtures/generate-large-book.ts` (new helper)
- `.github/workflows/ci.yml` (modify only if wall-clock limits need adjustment)

### Related ADRs

- [ADR-007: Testcontainers CI-only](../../000-foundation/adrs/adr-007.md) (Foundation).
- [ADR-004: Streaming discipline](adrs/adr-004.md) — enforced by large-book test.

## Deliverables

- 5 new integration test files.
- Synthetic large-book fixture generator.
- CI `integration` job green with all suites passing.
- 80 %+ coverage target applies to orchestration code paths exercised by these tests.

## Tests

- Unit tests:
  - [ ] Synthetic large-book generator: produces 400k tokens across 50 chapters deterministically (seeded generator).
- Integration tests (these ARE the tests for this task):
  - [ ] `migration-0003`: HNSW index exists with correct params (m=16, ef_construction=64).
  - [ ] `migration-0003`: CHECK constraint on `ingestion_progress` rejects insert with `progress=150`.
  - [ ] `migration-0003`: `vector(1536)` column accepts a 1536-dim array and returns it.
  - [ ] `ingestion-happy`: full 6-stage pipeline completes; `books.ingestion_status = 'ready'`; chunk count > 0; embeddings non-null.
  - [ ] `ingestion-retry`: embed-stage failure sets status `failed`; retry resumes only embed; downloader call count = 1.
  - [ ] `ingestion-retry`: Mock provider is called only for chunks without embeddings (verify by counting provider calls across retry).
  - [ ] `ingestion-large-book`: 400k-token synthetic book reaches `ready` without memory pressure failure.
  - [ ] `chunks-read`: `GET /chunks/:id` returns expected shape with chapter_title from the join.
  - [ ] CI green across `lint-and-typecheck`, `test`, `integration`, `build` jobs within the 15-minute ceiling.
- Test coverage target: >=80% on stages + routes code paths exercised.
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- CI `integration` job remains within budget (~15 min total wall-clock).
- Each suite runs independently (no shared state between suites).
