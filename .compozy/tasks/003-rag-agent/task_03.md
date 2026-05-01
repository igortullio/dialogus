---
status: completed
title: "semantic_search tool"
type: backend
complexity: medium
dependencies:
  - task_01
  - task_02
---

# Task 03: semantic_search tool

## Overview

Implement the `semantic_search` Mastra tool — the agent's primary retrieval path. The tool accepts a query, one or more book IDs, optional per-book spoiler caps, and a top-k parameter; calls `QueryEmbedder.embed()` on the query; invokes `ChunkReadRepository.searchSemantic()`; and returns structured chunks with scores per TechSpec § Implementation Design. Global top-k strategy applies (no per-book quota) per PRD ADR-004 and confirmed in TechSpec.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/rag/src/application/tools/semanticSearch.ts` exporting a factory `semanticSearchTool(deps: { chunkRepo: ChunkReadRepository; queryEmbedder: QueryEmbedder; logger: Logger }): Tool` compatible with Mastra's `createTool({...})` API at the pinned `@mastra/core` version.
- Tool `id`: `'semantic_search'`. `description` (displayed to the LLM): per TechSpec example — "Retrieve passages semantically similar to the query from selected books."
- Input Zod schema: `{ query: string(min 1), book_ids: array(uuid).min(1), spoiler_caps: record(uuid, int.min(0)).optional(), k: int.min(1).max(30).default(10) }`.
- Output Zod schema: `{ chunks: array(chunkWithContextSchema) }` where `chunkWithContextSchema` mirrors the `ChunkWithContext` entity with snake_case keys (`chunk_id`, `book_id`, `chapter_id`, `chapter_ordinal`, `chapter_title`, `text`, `score`, `excerpt_preview`) — LLMs handle snake_case tool output more reliably than camelCase.
- `execute` flow: (1) embed the query via `queryEmbedder.embed(query)`; (2) call `chunkRepo.searchSemantic({ bookIds, queryEmbedding, spoilerCaps, k })`; (3) map `ChunkWithContext[]` → output shape via a mapper function.
- `excerpt_preview` capped at 200 characters for transport efficiency (full text remains in `text`).
- Per TechSpec, top-k default is `10`; tool accepts override up to 30. Choice documented here and in TechSpec; do not change without an ADR.
- MUST log structured event per TechSpec § Monitoring: `{ event: 'tool_call', tool: 'semantic_search', thread_id?, book_ids, spoiler_caps_active, k, returned_count, duration_ms }`. `thread_id` pulled from Mastra execution context when available.
- MUST propagate `EmbeddingFailedError` as-is (no wrapping) so the agent can handle it via Mastra's tool-error convention.
- MUST export the factory from the package barrel.

</requirements>

## Subtasks

- [x] 3.1 Author Zod input + output schemas (co-located in the tool file).
- [x] 3.2 Author the `chunkWithContextSchema` + mapper (entity ↔ snake_case DTO).
- [x] 3.3 Implement the tool factory with dep injection.
- [x] 3.4 Extend package barrel.
- [x] 3.5 Unit tests with in-memory `ChunkReadRepository` mock + `MockQueryEmbedder`.

## Implementation Details

Reference TechSpec § Core Interfaces for the factory shape (`semanticSearchTool = (deps) => createTool({...})`). The mapper from `ChunkWithContext` (camelCase) to the tool's output DTO (snake_case) is a 3-line function; keep it colocated with the tool file, not in a separate mapper file — the one-time conversion is local to this tool's contract with the LLM.

Spoiler-cap propagation: the `spoiler_caps` input (if provided) is passed verbatim to `chunkRepo.searchSemantic`. The SQL-level filter (`chapter_ordinal <= cap`) lives in the Drizzle adapter owned by Feature 002 task_21 / task_05; this tool does not re-filter.

### Relevant Files

- `packages/rag/src/domain/ports/ChunkReadRepository.port.ts` (task_01) — contract.
- `packages/rag/src/domain/ports/QueryEmbedder.port.ts` (task_01) — contract.
- `packages/rag/src/domain/entities/ChunkWithContext.ts` (task_01) — read model.
- `packages/rag/src/domain/errors/RagError.ts` (task_01) — `EmbeddingFailedError`.
- TechSpec § Implementation Design → Core Interfaces — reference for factory shape.

### Dependent Files

- `packages/rag/src/application/tools/semanticSearch.ts` (new)
- `packages/rag/src/index.ts` (modify: barrel)
- `packages/rag/__tests__/application/tools/semanticSearch.test.ts` (new)

### Related ADRs

- [ADR-004: No reranking in V1; pure HNSW](adrs/adr-004.md) — tool returns top-k with `score`; shape ready for future reranker slot-in.
- [ADR-006: @dialogus/rag depends on @dialogus/ingestion](adrs/adr-006.md) — `ChunkReadRepository` satisfied by Feature 002's `DrizzleChunkRepository`.

## Deliverables

- `semanticSearch.ts` tool file with factory + schemas + mapper.
- Barrel extended.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_09 (`semantic-search.integration.test.ts`).

## Tests

- Unit tests:
  - [x] Happy path: `execute({ query: 'Ishmael', book_ids: ['<uuid>'], k: 5 })` → `queryEmbedder.embed()` called with `'Ishmael'`; `chunkRepo.searchSemantic` called with `{ bookIds: ['<uuid>'], queryEmbedding: <1536 numbers>, spoilerCaps: undefined, k: 5 }`; output `chunks.length === mocked repo return length`.
  - [x] Snake-case keys: output chunks have `chunk_id`, `chapter_ordinal`, `excerpt_preview` — NOT `chunkId` etc.
  - [x] `excerpt_preview` is truncated to 200 chars when chunk text is longer.
  - [x] Spoiler caps: `execute({ query: 'Ahab', book_ids: ['b1'], spoiler_caps: { b1: 10 }, k: 5 })` → `chunkRepo.searchSemantic` receives `spoilerCaps: { b1: 10 }`.
  - [x] Default k: `execute({ query: 'foo', book_ids: ['b1'] })` (no `k`) → repo called with `k: 10`.
  - [x] Zod input validation: empty `query` → rejected before calling repo.
  - [x] Zod input validation: `k: 31` → rejected (max 30).
  - [x] Zod input validation: non-UUID `book_ids[0]` → rejected.
  - [x] Error propagation: `queryEmbedder.embed` rejects with `EmbeddingFailedError` → tool rejects with same error (no wrapping).
  - [x] Logging: successful call emits a structured log line with the expected fields.
- Integration tests:
  - [ ] Deferred to task_09 (`semantic-search.integration.test.ts`).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Tool factory is pure: given the same deps + same input, output is a function of mocked repo output
- Snake-case output DTO aligns with what Feature 004's Chat UI will consume via Mastra's `tool_output`
- No real OpenAI or database calls in this task's unit tests
