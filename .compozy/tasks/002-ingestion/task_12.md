---
status: completed
title: Chunk stage handler
type: backend
complexity: medium
dependencies:
  - task_05
---

# Task 12: Chunk stage handler

## Overview

Implement `ingestion.chunk` (stage 4): iterates chapters (streaming; one chapter at a time in memory), splits each chapter into paragraph-aligned chunks targeting ~768 tokens with ~10-15% overlap, writes chunks to the `chunks` table incrementally (without embeddings yet), and enqueues `ingestion.embed`.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `packages/ingestion/src/application/stages/chunk.ts` as `chunkStage(payload: StagePayload, deps: StageDeps): Promise<void>`.
- Read book; update `ingestion_status='chunking'`, `ingestion_progress=0`, `ingestion_last_stage='chunk'`.
- Upstream "already done?" check: `chunks WHERE book_id = $1` count > 0 → skip to enqueue `ingestion.summarize` (next stage per ADR-008).
- Fetch chapters for book via `chapterRepo.listByBookId(bookId)` — as an iterator/cursor if Drizzle supports it; otherwise a streaming query.
- For each chapter (ONE AT A TIME; release from memory before the next):
  - Split `plain_text` on paragraph boundaries (`\n\n+` regex).
  - Pack consecutive paragraphs into a chunk, preserving paragraph boundaries; token-count via `js-tiktoken` (cl100k_base); stop when adding the next paragraph would exceed 768 tokens.
  - Apply 10-15% overlap: the next chunk starts with the last ~75-115 tokens of the previous chunk's trailing paragraphs.
  - Never split a single paragraph — if a paragraph alone exceeds 768 tokens, the chunk is that one paragraph (over-budget but structurally preserved).
  - Record `start_char` + `end_char` offsets into the chapter's `plain_text`.
  - Write chunks in batches of 50 via `chunkRepo.saveMany(batch)` (embedding = `null` at this stage).
- Update `ingestion_progress` per chapter completed (linear proportion of chapter index / total chapter count).
- On success, enqueue `ingestion.summarize` (per ADR-008; summarize sits between chunk and embed).
- On failure, set `ingestion_status='failed'`, `ingestion_error=<slug + message>`, rethrow as `ChunkError`.

</requirements>

## Subtasks

- [x] 12.1 Implement chapter iteration (streaming) + per-chapter chunking logic.
- [x] 12.2 Implement paragraph-packing with token accounting via `js-tiktoken`.
- [x] 12.3 Implement 10-15% overlap by re-including trailing paragraphs.
- [x] 12.4 Handle oversized-paragraph edge case (single paragraph > 768 tokens).
- [x] 12.5 Batch-save chunks every 50; emit pino log per batch.
- [x] 12.6 Unit tests covering typical chapter, oversize-paragraph, single-paragraph book.

## Implementation Details

Reference Feature 002 TechSpec § Core Features (chunk stage) and Key Decisions (chunk target 768 tokens). m5nita has no chunking analog; the algorithm is self-contained in this task. `start_char` / `end_char` are computed by tracking position within the chapter's `plain_text` as paragraphs are consumed.

### Relevant Files

- `packages/ingestion/src/infrastructure/persistence/DrizzleChapterRepository.ts` + `DrizzleChunkRepository.ts` (task_05).
- `packages/ingestion/src/domain/chunk/Chunk.ts` (task_04).
- `js-tiktoken` cl100k_base encoding documentation.

### Dependent Files

- `packages/ingestion/src/application/stages/chunk.ts` (new)
- `packages/ingestion/__tests__/application/stages/chunk.test.ts` (new)

### Related ADRs

- [ADR-001: Chained pg-boss jobs](adrs/adr-001.md) — chunk enqueues next stage.
- [ADR-003: Resume](adrs/adr-003.md) — upstream-check via `chunks.countByBookId`.
- [ADR-004: Streaming](adrs/adr-004.md) — one chapter at a time in memory.
- [ADR-008: Seventh stage (summarize)](adrs/adr-008.md) — chunk now enqueues `ingestion.summarize` instead of `ingestion.embed`.

## Deliverables

- Chunk stage handler implemented with paragraph-aligned 768-token chunking.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_16.

## Tests

- Unit tests:
  - [ ] A single chapter with 10 paragraphs (~50 tokens each) produces 1 chunk of ~500 tokens (under target).
  - [ ] A chapter with 20 paragraphs of ~50 tokens each produces 2 chunks, each ~500 tokens, with 10-15% overlap on the boundary.
  - [ ] Token count per chunk stays ≤ 768 + margin, except when a single paragraph exceeds.
  - [ ] A single-paragraph chapter with 1500 tokens becomes 1 chunk of 1500 tokens (no mid-paragraph split).
  - [ ] Overlap: last 75-115 tokens of chunk N appear at the start of chunk N+1.
  - [ ] `start_char` + `end_char` correctly bound the chunk's text within the chapter's `plain_text` (assert by substring match).
  - [ ] Upstream check: mocked `chunkRepo.countByBookId` > 0 → handler SKIPS chunking.
  - [ ] Multiple chapters: processed sequentially; in-memory footprint at any point is one chapter's worth (verify via mock calls showing chapter 1 complete → chapter 2 start → chapter 2 complete, etc.).
  - [ ] Progress emitted per chapter (mock `books.update` calls N times for N chapters).
- Integration tests:
  - [ ] Deferred to task_16.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Chunking produces stable, deterministic output for the same input — deterministic chunks are essential for embedding idempotency on retry.
- Memory discipline: chapter-at-a-time processing verified by test setup (no "load all chapters" pattern).
