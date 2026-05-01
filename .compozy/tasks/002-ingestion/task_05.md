---
status: completed
title: "@dialogus/ingestion persistence (repos + mappers)"
type: backend
complexity: medium
dependencies:
  - task_03
  - task_04
---

# Task 5: @dialogus/ingestion persistence (repos + mappers)

## Overview

Implement `DrizzleChapterRepository` + `DrizzleChunkRepository` satisfying the ports from task_04, with `ChapterMapper` + `ChunkMapper` translating between on-disk rows and domain entities. Repositories support the streaming queries required by stage handlers (embed stage queries `WHERE embedding IS NULL`; parse stage inserts chapters as they're discovered).

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST implement `packages/ingestion/src/infrastructure/persistence/DrizzleChapterRepository.ts` satisfying `ChapterRepository` port: `saveMany(chapters)` (batch INSERT with ON CONFLICT DO NOTHING by `(book_id, ordinal)`), `listByBookId(bookId)` (ORDER BY ordinal), `countByBookId(bookId)` (for stage "already done?" check), `findById(chapterId)`.
- MUST implement `packages/ingestion/src/infrastructure/persistence/DrizzleChunkRepository.ts` satisfying `ChunkRepository` port: `saveMany(chunks)`, `listByBookId(bookId)`, `listByBookIdWithoutEmbedding(bookId)` (uses partial index), `updateEmbeddingsBatch(pairs)` (batch UPDATE setting embedding on many chunks in one call), `countByBookId(bookId)`, `findById(chunkId)`.
- MUST implement `packages/ingestion/src/infrastructure/persistence/mappers/ChapterMapper.ts` with `toDomain(row)` + `toPersistence(chapter)` methods; round-trip MUST be lossless.
- MUST implement `packages/ingestion/src/infrastructure/persistence/mappers/ChunkMapper.ts` similarly; MUST convert `embedding` column (pgvector `vector(1536)`) to/from `number[]` domain form.
- `updateEmbeddingsBatch(pairs)` MUST use one SQL `UPDATE ... FROM (VALUES ...) WHERE chunks.id = v.id` statement for the batch (efficient; avoids N round-trips); fallback to per-row UPDATE acceptable only if Drizzle's bulk-update helper is insufficient.
- `listByBookIdWithoutEmbedding` MUST use an async iterator / cursor so streaming through thousands of chunks doesn't materialize all in memory (ADR-004).
- Add `@dialogus/db@workspace:*` to `packages/ingestion/package.json` deps.

</requirements>

## Subtasks

- [x] 5.1 Implement `ChapterMapper` + `ChunkMapper` with round-trip functions.
- [x] 5.2 Implement `DrizzleChapterRepository` with all port methods.
- [x] 5.3 Implement `DrizzleChunkRepository` with streaming list + batch update.
- [x] 5.4 Unit tests with mocked Drizzle client (use-case style).
- [x] 5.5 Round-trip mapper tests covering every column.

## Implementation Details

Reference Feature 002 TechSpec § Core Interfaces (ChapterRepository, ChunkRepository) and § Data Models. For streaming reads, use `postgres.js` cursor mode via Drizzle's `.iterator()` or raw cursor query if needed.

### Relevant Files

- `packages/ingestion/src/domain/chapter/ChapterRepository.port.ts` + `chunk/ChunkRepository.port.ts` (task_04).
- `packages/db/src/schema/chapters.ts` + `chunks.ts` (task_03).
- `packages/catalog/src/infrastructure/persistence/DrizzleBookRepository.ts` (001-catalog task_07) — pattern reference.
- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/infrastructure/persistence/DrizzlePoolRepository.ts` — template.

### Dependent Files

- `packages/ingestion/src/infrastructure/persistence/DrizzleChapterRepository.ts` (new)
- `packages/ingestion/src/infrastructure/persistence/DrizzleChunkRepository.ts` (new)
- `packages/ingestion/src/infrastructure/persistence/mappers/ChapterMapper.ts` (new)
- `packages/ingestion/src/infrastructure/persistence/mappers/ChunkMapper.ts` (new)
- `packages/ingestion/package.json` (modify: add `@dialogus/db`)
- `packages/ingestion/__tests__/infrastructure/persistence/DrizzleChapterRepository.test.ts` (new)
- `packages/ingestion/__tests__/infrastructure/persistence/DrizzleChunkRepository.test.ts` (new)
- `packages/ingestion/__tests__/infrastructure/persistence/mappers/ChapterMapper.test.ts` (new)
- `packages/ingestion/__tests__/infrastructure/persistence/mappers/ChunkMapper.test.ts` (new)

### Related ADRs

- [ADR-004: Streaming discipline](adrs/adr-004.md) — chunk repository's streaming iterator enforces it.

## Deliverables

- Two repositories + two mappers implemented.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_16 (exercised by integration suites against real Postgres + pgvector).

## Tests

- Unit tests:
  - [x] `ChapterMapper.toDomain(row)` converts Drizzle row into a domain `Chapter` with all fields.
  - [x] `ChapterMapper.toPersistence(chapter)` is the inverse of `toDomain`.
  - [x] `ChunkMapper.toDomain(row)` converts the `embedding` pgvector column into a `number[]` of length 1536.
  - [x] `ChunkMapper.toDomain(row)` returns `null` embedding when the column is null.
  - [x] `ChunkMapper.toPersistence(chunk)` with `null` embedding writes `null` to DB.
  - [x] `DrizzleChapterRepository.saveMany([chapter1, chapter2])` calls `insert.onConflictDoNothing()` on mocked Drizzle.
  - [x] `DrizzleChapterRepository.countByBookId(id)` returns the mocked count.
  - [x] `DrizzleChunkRepository.listByBookIdWithoutEmbedding(id)` returns an async iterator (not a plain Array).
  - [x] `DrizzleChunkRepository.updateEmbeddingsBatch([{id, embedding}, ...])` issues one UPDATE statement on mocked Drizzle (call-count = 1).
- Integration tests:
  - [ ] Deferred to task_16 — `ingestion-happy.integration.test.ts` exercises the repositories against Testcontainers.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Streaming iterator returns chunks one-at-a-time (does not load all at once).
- Round-trip via mappers preserves every column including embedding nullability + pgvector dimensionality.
