---
status: completed
title: "@dialogus/ingestion scaffold + domain layer"
type: backend
complexity: medium
dependencies:
  - task_01
---

# Task 4: @dialogus/ingestion scaffold + domain layer

## Overview

Scaffold the `@dialogus/ingestion` workspace package and author its domain layer: `Chapter` + `Chunk` entities, `ChapterRepository` + `ChunkRepository` + `EmbeddingProvider` + `ChapterParser` ports, and the 6 ingestion error classes (one per stage). No infrastructure or application code in this task — domain definitions only, following m5nita's hexagonal template adapted for a package-internal bounded context.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/ingestion/package.json` with `"name": "@dialogus/ingestion"`, `"type": "module"`, deps on `zod`, `@dialogus/shared@workspace:*`. Infrastructure libs (`@gxl/epub-parser`, `@ai-sdk/openai`, `bottleneck`, etc.) NOT added here — they arrive with respective infrastructure tasks.
- MUST create hexagonal folder layout: `src/domain/{chapter,chunk,embedding,parser,ingestion}/`, `src/application/stages/`, `src/infrastructure/{persistence,external,parsing}/`.
- MUST implement `Chapter.ts` entity with readonly fields per Feature 002 TechSpec § Core Interfaces (ParsedChapter shape aligns with Chapter persisted form, but without `id` and `bookId` in the parser output per TechSpec).
- MUST implement `Chunk.ts` entity with readonly fields matching `chunks` table columns plus derived types.
- MUST implement `ChapterRepository.port.ts` + `ChunkRepository.port.ts` interfaces (signatures inferred from stage handler needs: `saveMany`, `listByBookId`, `listByBookIdWithoutEmbedding`, `findById`).
- MUST implement `EmbeddingProvider.port.ts` with `dimensions: 1536` literal + `modelName: string` + `embed(texts: string[]): Promise<number[][]>`.
- MUST implement `ChapterParser.port.ts` with `parse(rawFilePath: string, language: 'en' | 'pt'): AsyncIterable<ParsedChapter>` returning an async iterable (streaming per ADR-004).
- MUST implement `IngestionError.ts` with one class per stage: `DownloadError`, `CleanError`, `ParseError`, `ChunkError`, `EmbedError`, `IndexError` — all extending `DialogusError` with appropriate slug codes matching task_01's additions.
- MUST only export domain types + ports + errors from `src/index.ts` — never adapters (they're implementation details of the package).

</requirements>

## Subtasks

- [x] 4.1 Scaffold package (`package.json`, `tsconfig.json`, folder tree).
- [x] 4.2 Author `Chapter` + `Chunk` entities.
- [x] 4.3 Author the 4 port interfaces.
- [x] 4.4 Author 6 error classes in `IngestionError.ts`.
- [x] 4.5 Create barrel exports from `src/index.ts`.
- [x] 4.6 Unit tests for error-class behavior.

## Implementation Details

Reference Feature 002 TechSpec § Core Interfaces for the port signatures. m5nita's `apps/api/src/domain/pool/` + catalog's `packages/catalog/src/domain/book/` are the templates.

### Relevant Files

- Feature 002 TechSpec § Core Interfaces.
- `packages/catalog/src/domain/book/` (from 001-catalog task_06) — pattern reference.
- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/domain/pool/` — m5nita DDD template.

### Dependent Files

- `packages/ingestion/package.json` (new)
- `packages/ingestion/tsconfig.json` (new)
- `packages/ingestion/src/index.ts` (new barrel)
- `packages/ingestion/src/domain/chapter/Chapter.ts` (new)
- `packages/ingestion/src/domain/chapter/ChapterRepository.port.ts` (new)
- `packages/ingestion/src/domain/chunk/Chunk.ts` (new)
- `packages/ingestion/src/domain/chunk/ChunkRepository.port.ts` (new)
- `packages/ingestion/src/domain/embedding/EmbeddingProvider.port.ts` (new)
- `packages/ingestion/src/domain/parser/ChapterParser.port.ts` (new)
- `packages/ingestion/src/domain/ingestion/IngestionError.ts` (new)
- `packages/ingestion/__tests__/domain/ingestion/IngestionError.test.ts` (new)

### Related ADRs

- [ADR-004: Streaming discipline](adrs/adr-004.md) — ChapterParser returning AsyncIterable is the streaming contract.
- [ADR-006: Chapter heuristics YAML](adrs/adr-006.md) — ChapterParser is the port; TxtChapterParser (task_08) consumes the YAML.

## Deliverables

- `@dialogus/ingestion` package scaffolded.
- Domain entities + ports + errors exported via public barrel.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_16 where domain types flow through integration suites.

## Tests

- Unit tests:
  - [x] `new DownloadError('gutendex 503 timeout')` → `err.code === 'INGESTION_DOWNLOAD_FAILED'` and `err instanceof DialogusError`.
  - [x] `new ParseError('no chapters detected in EPUB spine')` → `err.code === 'INGESTION_PARSE_FAILED'`.
  - [x] `new EmbedError('OpenAI 429 rate-limited')` → `err.code === 'INGESTION_EMBED_FAILED'`; has `retryable: true` metadata field.
  - [x] All 6 error classes inherit from `DialogusError` and preserve `cause`.
  - [x] Importing `Chapter`, `Chunk`, `ChapterRepository`, `EmbeddingProvider`, `ChapterParser` from `@dialogus/ingestion` root resolves.
  - [x] Barrel does NOT export from `infrastructure/` (empty folders at this task; constraint is permanent).
- Integration tests:
  - [ ] Deferred to task_16.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- All downstream tasks (05-13) can import domain types and ports from `@dialogus/ingestion`.
- No adapter leaks across the public barrel.
