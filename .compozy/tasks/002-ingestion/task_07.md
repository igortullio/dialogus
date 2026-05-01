---
status: completed
title: EmbeddingProvider adapters (OpenAI + Mock)
type: backend
complexity: medium
dependencies:
  - task_04
---

# Task 7: EmbeddingProvider adapters (OpenAI + Mock)

## Overview

Implement both adapters satisfying the `EmbeddingProvider` port from task_04: `OpenAIEmbeddingProvider` using `@ai-sdk/openai` with retry + batch semantics for real embeddings, and `MockEmbeddingProvider` producing deterministic 1536-dimensional unit vectors for every test in the project. Together they make the embed stage both production-ready and CI-testable without OpenAI spending.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `packages/ingestion/src/infrastructure/external/OpenAIEmbeddingProvider.ts` satisfying `EmbeddingProvider` port: `dimensions: 1536`, `modelName: 'text-embedding-3-small'`, `embed(texts: string[]): Promise<number[][]>`.
- MUST use `@ai-sdk/openai` package for the model call (not raw fetch).
- MUST batch: accept up to 100 inputs per `embed()` call; throw if more (let caller batch explicitly).
- MUST retry on 429 (rate limited): exponential backoff with 3 attempts total (base 1s, max 8s); explicit 429 handling beyond `@ai-sdk/openai` defaults.
- MUST retry on 5xx: 2 attempts total, 1s base.
- MUST throw `EmbedError` (from task_04) on final failure with upstream status + `retryable: true`.
- MUST implement `packages/ingestion/src/infrastructure/external/MockEmbeddingProvider.ts` satisfying the same port: deterministic — same input string always yields the same 1536-dim unit vector (via SHA-256 → seeded PRNG → normalize).
- `MockEmbeddingProvider.embed([...])` MUST return vectors that are unit-length (L2 norm = 1.0 ± 1e-6) and dimensions=1536.
- `MockEmbeddingProvider` MUST NOT make any network calls.
- Add `@ai-sdk/openai@^3` to `packages/ingestion/package.json` deps.

</requirements>

## Subtasks

- [x] 7.1 Implement `OpenAIEmbeddingProvider` with batching + retries.
- [x] 7.2 Implement `MockEmbeddingProvider` with deterministic SHA-256-seeded vectors.
- [x] 7.3 Commit MSW handlers for OpenAI embedding endpoint.
- [x] 7.4 Unit tests: deterministic mock + OpenAI happy path + 429 retry path + 5xx retry path.

## Implementation Details

Reference Feature 002 TechSpec § Integration Points (OpenAI row) for rate-limit defaults + pricing context. `@ai-sdk/openai` has built-in `experimental_embedMany` or equivalent batching; use it if available, otherwise wrap `generateEmbedding` in a batching helper.

### Relevant Files

- `packages/ingestion/src/domain/embedding/EmbeddingProvider.port.ts` (task_04).
- `packages/ingestion/src/domain/ingestion/IngestionError.ts` (task_04) — `EmbedError` class.
- Feature 002 TechSpec § Integration Points (OpenAI row).
- `packages/catalog/src/infrastructure/external/GutendexHttpClient.ts` (001-catalog task_08) — pattern for MSW-tested external adapter.

### Dependent Files

- `packages/ingestion/src/infrastructure/external/OpenAIEmbeddingProvider.ts` (new)
- `packages/ingestion/src/infrastructure/external/MockEmbeddingProvider.ts` (new)
- `packages/ingestion/__fixtures__/openai/handlers.ts` (new MSW handlers)
- `packages/ingestion/__fixtures__/openai/embed-200.json` (new fixture)
- `packages/ingestion/__fixtures__/openai/embed-429.json` (new fixture)
- `packages/ingestion/package.json` (modify: add `@ai-sdk/openai`)
- `packages/ingestion/__tests__/infrastructure/external/OpenAIEmbeddingProvider.test.ts` (new)
- `packages/ingestion/__tests__/infrastructure/external/MockEmbeddingProvider.test.ts` (new)

### Related ADRs

- [ADR-004: Streaming discipline](adrs/adr-004.md) — provider must NOT accumulate all embeddings across batches in memory (caller controls memory via batch loop).

## Deliverables

- Two adapters implemented.
- MSW fixtures committed.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_16 (`ingestion-happy.integration.test.ts` uses `MockEmbeddingProvider`).

## Tests

- Unit tests:
  - [x] `MockEmbeddingProvider.embed(['hello'])` returns `[[...1536 numbers...]]`.
  - [x] `MockEmbeddingProvider.embed(['hello'])` twice returns identical vectors (determinism).
  - [x] `MockEmbeddingProvider.embed(['hello', 'world'])` returns 2 vectors, both unit-length (L2 norm ~= 1.0).
  - [x] `MockEmbeddingProvider.embed(['hello'])` and `.embed(['world'])` return different vectors (no collision on different input).
  - [x] `MockEmbeddingProvider` makes zero network calls (MSW assertion).
  - [x] `OpenAIEmbeddingProvider.embed(['text'])` with MSW 200 fixture returns correct-shape vectors.
  - [x] `OpenAIEmbeddingProvider.embed(Array(101).fill('x'))` throws (batch limit = 100).
  - [x] `OpenAIEmbeddingProvider` 429 response: retries 3 times with exponential backoff, then eventually succeeds if MSW returns 200 on attempt 3.
  - [x] `OpenAIEmbeddingProvider` after all 3 retries exhausted: throws `EmbedError` with `retryable: true`.
  - [x] `OpenAIEmbeddingProvider` 5xx response: retries 2× then throws `EmbedError`.
  - [x] `OpenAIEmbeddingProvider` `dimensions === 1536` and `modelName === 'text-embedding-3-small'`.
- Integration tests:
  - [ ] Deferred to task_16.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `MockEmbeddingProvider` is the default injected adapter in test setups for tasks 10-13, 15, 16 — no test calls real OpenAI.
- `OpenAIEmbeddingProvider` is production-injected via apps/worker wiring (task_15).
