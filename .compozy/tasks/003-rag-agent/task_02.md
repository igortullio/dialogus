---
status: completed
title: "QueryEmbedder adapters (OpenAI + Mock)"
type: backend
complexity: low
dependencies:
  - task_01
---

# Task 02: QueryEmbedder adapters (OpenAI + Mock)

## Overview

Implement the two `QueryEmbedder` port adapters per TechSpec § Component Overview: `OpenAIQueryEmbedder` (production, via `@ai-sdk/openai` calling `text-embedding-3-small`) and `MockQueryEmbedder` (deterministic unit vectors for tests). Feature 002 already owns a separate `OpenAIEmbeddingProvider` for batch document embedding at ingestion time; this task introduces the query-time single-call embedder used by `semantic_search`.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/rag/src/infrastructure/embedding/OpenAIQueryEmbedder.ts` satisfying `QueryEmbedder` (task_01):
  - Uses `@ai-sdk/openai` with model `text-embedding-3-small`.
  - Single-query API: `embed(query: string): Promise<number[]>` — NOT batch. Latency per call is the primary concern.
  - Retries handled by `@ai-sdk/openai` built-in retry; 429 surfaces as `EmbeddingFailedError` (from task_01).
  - `dimensions` property equals `1536`; `modelName` equals `'text-embedding-3-small'`.
  - Reads API key from `@dialogus/shared/config` (loaded once per process).
- MUST create `packages/rag/src/infrastructure/embedding/MockQueryEmbedder.ts` satisfying `QueryEmbedder`:
  - Deterministic: same input → identical 1536-dim vector.
  - Implementation: hash-based (e.g., seed a PRNG with the SHA-256 of the query; fill vector; normalize to unit length).
  - Different inputs produce different vectors (collision probability negligible).
  - `modelName === 'mock-query-embedder'`.
  - Zero network calls.
- MUST export both classes from the package barrel `packages/rag/src/index.ts`.
- MUST NOT reuse Feature 002's `OpenAIEmbeddingProvider` — that adapter is batched and shaped for ingestion throughput. The query embedder is shaped for single-call low-latency use.

</requirements>

## Subtasks

- [x] 2.1 Implement `OpenAIQueryEmbedder.ts` with `@ai-sdk/openai` client + error mapping.
- [x] 2.2 Implement `MockQueryEmbedder.ts` with SHA-256-seeded PRNG.
- [x] 2.3 Extend package barrel.
- [x] 2.4 Unit tests with MSW-mocked OpenAI for the real adapter + determinism tests for the mock.

## Implementation Details

Reference TechSpec § Integration Points for retry semantics; Feature 002's `OpenAIEmbeddingProvider` as the closest in-project template (different shape: batch vs. single). The `MockQueryEmbedder`'s PRNG implementation stays small — TypeScript's built-in `crypto.subtle.digest` (or Node's `crypto.createHash`) for SHA-256; a xorshift PRNG seeded from the digest bytes produces the 1536 floats; final normalization enforces unit length.

### Relevant Files

- `packages/ingestion/src/infrastructure/external/OpenAIEmbeddingProvider.ts` (Feature 002 task_07) — template for `@ai-sdk/openai` usage (batch shape, not query shape).
- `packages/ingestion/src/infrastructure/external/MockEmbeddingProvider.ts` (Feature 002 task_07) — template for determinism pattern.
- `packages/rag/src/domain/ports/QueryEmbedder.port.ts` (task_01) — contract.
- `packages/rag/src/domain/errors/RagError.ts` (task_01) — `EmbeddingFailedError`.

### Dependent Files

- `packages/rag/src/infrastructure/embedding/OpenAIQueryEmbedder.ts` (new)
- `packages/rag/src/infrastructure/embedding/MockQueryEmbedder.ts` (new)
- `packages/rag/src/index.ts` (modify: barrel)
- `packages/rag/__tests__/infrastructure/embedding/OpenAIQueryEmbedder.test.ts` (new)
- `packages/rag/__tests__/infrastructure/embedding/MockQueryEmbedder.test.ts` (new)

### Related ADRs

- [ADR-004: No reranking in V1; pure HNSW](adrs/adr-004.md) — query embedding is the only retrieval compute step.

## Deliverables

- Two adapter implementations.
- Barrel updated.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_09 (semantic_search integration tests exercise OpenAIQueryEmbedder end-to-end).

## Tests

- Unit tests:
  - [x] `OpenAIQueryEmbedder.embed('hello')` with MSW-mocked 200 response → returns number[] of length 1536.
  - [x] `OpenAIQueryEmbedder.embed('hello')` with MSW-mocked 429 then 200 → returns number[] (retry success).
  - [x] `OpenAIQueryEmbedder.embed('hello')` with persistent MSW-mocked 500 → throws `EmbeddingFailedError`.
  - [x] `OpenAIQueryEmbedder.dimensions === 1536`.
  - [x] `MockQueryEmbedder.embed('hello')` returns number[] of length 1536.
  - [x] `MockQueryEmbedder.embed('hello')` called twice returns identical arrays.
  - [x] `MockQueryEmbedder.embed('hello')` vs. `embed('world')` returns different arrays (any position differs).
  - [x] `MockQueryEmbedder.embed('hello')` returns a unit-length vector (sum of squares ≈ 1.0 within ε).
  - [x] `MockQueryEmbedder.modelName === 'mock-query-embedder'`.
- Integration tests:
  - [ ] Deferred to task_09.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- No real OpenAI calls in unit tests (MSW only)
- `MockQueryEmbedder.embed()` completes in under 10ms on dev hardware (enables fast downstream tests)
- Both classes are exported from `@dialogus/rag` barrel
