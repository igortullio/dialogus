---
status: completed
title: Embed + Index stage handlers
type: backend
complexity: medium
dependencies:
  - task_05
  - task_07
---

# Task 13: Embed + Index stage handlers

## Overview

Implement the final two stage handlers: `ingestion.embed` (stage 5) generates embeddings for chunks with `embedding IS NULL` in batches of 100 via the injected `EmbeddingProvider`, writing updates back incrementally; `ingestion.index` (stage 6) runs `VACUUM ANALYZE` on `chunks` and transitions the book to `ready`. Both handlers respect streaming + resume per ADRs.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `packages/ingestion/src/application/stages/embed.ts` as `embedStage(payload: StagePayload, deps: StageDeps): Promise<void>`:
  - Read book; update `ingestion_status='embedding'`, `ingestion_progress=0`, `ingestion_last_stage='embed'`.
  - Stream-read chunks with `chunkRepo.listByBookIdWithoutEmbedding(bookId)` (uses partial index from task_03).
  - Buffer into batches of 100 texts; call `deps.embeddingProvider.embed(batchTexts)` → `number[][]`.
  - Write embeddings back via `chunkRepo.updateEmbeddingsBatch([{id, embedding}, ...])` per batch.
  - Update `ingestion_progress` proportional to batches completed vs. total batches.
  - On `EmbedError` (from provider), set `ingestion_status='failed'`, rethrow.
  - On success, enqueue `ingestion.index`.
- MUST implement `packages/ingestion/src/application/stages/index.ts` as `indexStage(payload: StagePayload, deps: StageDeps): Promise<void>`:
  - Read book; update `ingestion_status='indexing'`, `ingestion_progress=0`, `ingestion_last_stage='index'`.
  - Run `VACUUM ANALYZE chunks` via raw Drizzle execution to refresh HNSW statistics.
  - Update `ingestion_status='ready'`, `ingestion_progress=100`, `indexed_at=now()`.
  - Emit final log with total pipeline duration (computed from `ingestion_started_at` to now) + per-stage breakdown (read from stage log events if available, else skip).
  - Does NOT enqueue — terminal stage.
- MUST respect resume semantics: `embedStage` is already idempotent by design (only processes chunks WHERE embedding IS NULL). `indexStage` is idempotent (ANALYZE is safe to re-run).

</requirements>

## Subtasks

- [x] 13.1 Implement `embedStage` with streaming + batching + partial retries.
- [x] 13.2 Implement `indexStage` with VACUUM ANALYZE + final state update.
- [x] 13.3 Pino logs per batch (embed) + final pipeline summary (index).
- [x] 13.4 Unit tests for both handlers with mocked provider + repository.

## Implementation Details

Reference Feature 002 TechSpec § Core Features (stages 5 + 6) and § Key Decisions on OpenAI batching. `VACUUM ANALYZE` runs via `db.execute(sql\`VACUUM ANALYZE chunks;\`)` — note that VACUUM cannot run inside a transaction in Postgres; `postgres.js` + Drizzle handle this if the statement is executed outside a `db.transaction(...)` block.

### Relevant Files

- `packages/ingestion/src/domain/embedding/EmbeddingProvider.port.ts` (task_04).
- `packages/ingestion/src/infrastructure/persistence/DrizzleChunkRepository.ts` (task_05).
- Feature 002 TechSpec § Core Features (stages 5, 6).

### Dependent Files

- `packages/ingestion/src/application/stages/embed.ts` (new)
- `packages/ingestion/src/application/stages/index.ts` (new)
- `packages/ingestion/__tests__/application/stages/embed.test.ts` (new)
- `packages/ingestion/__tests__/application/stages/index.test.ts` (new)

### Related ADRs

- [ADR-001: Chained pg-boss jobs](adrs/adr-001.md) — embed enqueues index; index is terminal.
- [ADR-003: Resume](adrs/adr-003.md) — embedStage idempotent by design.
- [ADR-004: Streaming](adrs/adr-004.md) — chunk-read iterator + batch-writes.

## Deliverables

- Embed + index stage handlers implemented.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_16.

## Tests

- Unit tests (embed):
  - [x] Mocked chunk iterator yielding 150 chunks without embeddings → `embedStage` calls `embeddingProvider.embed` twice (batch 100 + batch 50); `chunkRepo.updateEmbeddingsBatch` called twice with correct pair counts.
  - [x] Mocked `embeddingProvider.embed` throws `EmbedError` on second batch → handler sets `ingestion_status='failed'`, rethrows; first batch's updates ARE preserved (already written).
  - [x] Upstream check (resume after partial embed): mocked iterator yields 50 chunks (the unembedded remainder from a prior partial run) → handler processes them and transitions to ready.
  - [x] Zero-chunks case: iterator empty → embedStage still enqueues `ingestion.index` (no error; book had no chunks, which is degenerate but tolerated).
  - [x] Progress updates emitted proportional to batches (e.g., 50% after first of two batches).
- Unit tests (index):
  - [x] `indexStage` runs `VACUUM ANALYZE chunks` via mock db.execute (assert SQL contains `VACUUM ANALYZE`).
  - [x] Sets `ingestion_status='ready'`, `indexed_at=now()`, `ingestion_progress=100`.
  - [x] Final pino log emitted with `{ book_id, total_duration_ms, stage: 'index' }`.
  - [x] Does NOT call `deps.pgboss.send` (terminal stage).
- Integration tests:
  - [ ] Deferred to task_16.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Embed stage is idempotent: calling it multiple times after partial failures converges to the same fully-embedded state.
- Index stage leaves the book in a queryable `ready` state; HNSW statistics fresh.
