---
status: completed
title: "Integration test suite (5 suites, Testcontainers + MSW)"
type: test
complexity: high
dependencies:
  - task_08
---

# Task 09: Integration test suite (5 suites, Testcontainers + MSW)

## Overview

Ship the five integration test suites defined in TechSpec § Testing Approach → Integration Tests. All suites run against Testcontainers (Postgres 18 + pgvector) with MSW-mocked Anthropic; `MockQueryEmbedder` replaces `OpenAIQueryEmbedder` for deterministic embeddings. The suites exercise the full path from Mastra agent → tool → Drizzle adapter → Postgres, plus the agent conversation loop end-to-end with fixture LLM responses that emit citation markers against real seeded chunk IDs.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create the following integration test files under `apps/mastra/__tests__/integration/` (or a comparable directory already used by Features 001/002 — verify and align):
  - `summaries-read.integration.test.ts` — seeds 1 book + 3 chapters + 3 summaries; asserts `DrizzleChapterSummaryRepository.findByChapterId` returns correct data and `null` for unknown id.
  - `semantic-search.integration.test.ts` — seeds 1 book + 5 chapters + 15 chunks with `MockEmbeddingProvider`-generated deterministic vectors; runs `semantic_search` tool; asserts HNSW query returns expected top-k with correct ordering; runs again with spoiler cap; asserts post-cap chunks excluded; adds a second book; asserts multi-book global-top-k mixing.
  - `agent-conversation.integration.test.ts` — MSW-mocks Anthropic chat completions with fixture responses that (a) call `semantic_search`, (b) emit `{{cite:<uuid>}}` markers against real chunk IDs from seeded data, (c) exercise the refusal-with-hints path when `semantic_search` returns empty. Asserts marker regex matches, marker chunk_ids exist in `tool_output`, refusal path contains reformulation lines (bullets or dash-prefixed lines).
  - `spoiler-cap.integration.test.ts` — 5-chapter book; thread posts `spoiler_caps: { <book_id>: 2 }`; runs `semantic_search` via tool; asserts no chunks with `chapter_ordinal > 2` in the result. Assertion at tool level (not agent level) since the filter is SQL.
  - `find-character-mentions.integration.test.ts` — seeds chunks containing "Ishmael" and "Ishmaël" (diacritic variant) + "Queequeg"; runs tool with `aliases: ['Ishmael']`; asserts both mentions returned (diacritics-insensitive); asserts earliest-chapter ordering.
- MUST share test fixtures across suites: one `seedFixtures()` helper that writes a consistent book/chapter/chunk/summary graph, reused by multiple suites. Place in `apps/mastra/__tests__/integration/_helpers/seed.ts`.
- MUST use Testcontainers via the harness established in Feature 001's `@testcontainers/postgresql` setup; apply migrations 0000 → 0004 (Foundation, Catalog, Ingestion, Chapter Summaries).
- MUST use `MockEmbeddingProvider` (Feature 002) for document vectors and `MockQueryEmbedder` (task_02) for query vectors — deterministic pairs so that queries retrieve expected chunks.
- MUST use MSW to intercept Anthropic `POST /v1/messages` calls in the agent conversation test; fixtures simulate tool-use + final assistant message with citations.
- MUST NOT hit real Anthropic or OpenAI; per-suite wall-clock < 30 seconds; whole task suite < 3 minutes (per TechSpec § Testing Approach).
- MUST assert no unhandled promise rejections across the suite (Vitest config).

</requirements>

## Subtasks

- [x] 9.1 Author `_helpers/seed.ts` with the shared fixture writer.
- [x] 9.2 Author `summaries-read.integration.test.ts`.
- [x] 9.3 Author `semantic-search.integration.test.ts`.
- [x] 9.4 Author `agent-conversation.integration.test.ts` with MSW Anthropic fixtures.
- [x] 9.5 Author `spoiler-cap.integration.test.ts`.
- [x] 9.6 Author `find-character-mentions.integration.test.ts`.
- [x] 9.7 Verify per-suite + total wall-clock within budget.

## Implementation Details

Reference TechSpec § Testing Approach → Integration Tests for the assertion targets. Feature 001 + Feature 002 establish Testcontainers + MSW + migrations as in-project conventions; reuse those patterns. The MSW Anthropic fixture for `agent-conversation.integration.test.ts` is the most delicate piece — it must reproduce Mastra's expected response shape (tool-use blocks, stop reasons, cache metadata) at the pinned Mastra version.

Shared `seedFixtures` helper returns an object with ids: `{ book1Id, chapterIds: [], chunkIds: [], summaryIds: [] }` so tests can reference specific rows without recomputing. Each suite wraps its assertions in a transaction-rollback `afterEach` if feasible, or recreates the DB per suite — Testcontainers per suite is already the product ADR-007 pattern, so reuse the per-suite container boot.

### Relevant Files

- `apps/api/__tests__/integration/*.integration.test.ts` (Features 001 + 002) — templates for Testcontainers + MSW patterns.
- `apps/mastra/src/index.ts` + `mastra.config.ts` (task_08) — app under test.
- `packages/rag/src/application/tools/*.ts` (tasks 03–05) — tool factories.
- `packages/rag/src/application/createDialogusAgent.ts` (task_07) — agent factory.
- `packages/ingestion/src/infrastructure/persistence/*.ts` (Features 002 tasks 05 + 21) — Drizzle adapters.
- TechSpec § Testing Approach → Integration Tests (the contract for this task).

### Dependent Files

- `apps/mastra/__tests__/integration/_helpers/seed.ts` (new)
- `apps/mastra/__tests__/integration/summaries-read.integration.test.ts` (new)
- `apps/mastra/__tests__/integration/semantic-search.integration.test.ts` (new)
- `apps/mastra/__tests__/integration/agent-conversation.integration.test.ts` (new)
- `apps/mastra/__tests__/integration/spoiler-cap.integration.test.ts` (new)
- `apps/mastra/__tests__/integration/find-character-mentions.integration.test.ts` (new)
- `apps/mastra/vitest.integration.config.ts` (new or extend existing Vitest config for `*.integration.test.ts` patterns)

### Related ADRs

- Product [ADR-007: Testcontainers, CI-only](../dialogus/adrs/adr-007.md) — integration-test placement.
- [ADR-003: Refusal](adrs/adr-003.md) — agent-conversation test exercises the refusal path.
- [ADR-004: No reranking](adrs/adr-004.md) — semantic-search test validates top-k ordering without reranker.
- [ADR-005: chapter_summaries](adrs/adr-005.md) — summaries-read test.
- [ADR-007: Citation marker](adrs/adr-007.md) — agent-conversation test validates marker regex + chunk_id resolution.

## Deliverables

- 5 integration test files + 1 helper.
- Vitest integration config + `test:integration` script (or reuse existing from Features 001/002).
- Unit tests with 80%+ coverage **(REQUIRED)** — test-helper unit coverage is the unit surface.
- Integration tests **(REQUIRED)** — this task IS the integration suite; coverage target ≥ 80% applies to `@dialogus/rag` exercised end-to-end.

## Tests

- Unit tests:
  - [x] `_helpers/seed.ts` — `seedFixtures(db)` returns an object with non-empty id arrays; re-running it against a clean DB is idempotent (wrapped in a transaction or uses `uuid_generate_v4`).
- Integration tests (each file is its own suite):
  - [x] `summaries-read`: findByChapterId for seeded chapter returns full entity; unknown chapter returns null.
  - [x] `semantic-search`: top-k=3 on single book returns 3 chunks in score-descending order; top-k=5 on 2 books with 10 chunks each returns 5 global mix; spoiler cap excludes chunks above ordinal.
  - [x] `agent-conversation`: MSW fixture serves a tool-use response → `semantic_search` hits real DB → tool output populated → final assistant response contains `{{cite:<uuid>}}` marker whose UUID matches a seeded chunk id.
  - [x] `agent-conversation` refusal: MSW fixture with a query that seeded chunks do NOT match → agent response contains no `{{cite:}}` marker and contains at least 2 reformulation bullets (lines starting with `- ` or `* `).
  - [x] `spoiler-cap`: 5-chapter book, cap at 2; `semantic_search` output contains zero chunks with `chapter_ordinal > 2`.
  - [x] `find-character-mentions`: mix of "Ishmael" + "Ishmaël" in seeded chunks → alias `['Ishmael']` returns both; sorted by `chapter_ordinal` ascending.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Per-suite wall-clock < 30 seconds; total < 3 minutes
- Zero real LLM / embedding API calls (MSW + mocks only)
- Mastra-agent end-to-end path (tool_use loop → tool → Drizzle → Postgres → MSW-mocked final) verified in `agent-conversation.integration.test.ts`
