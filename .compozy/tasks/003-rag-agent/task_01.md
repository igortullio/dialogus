---
status: completed
title: "@dialogus/rag domain layer (ports + entities + errors + barrel)"
type: backend
complexity: medium
dependencies: []
---

# Task 01: @dialogus/rag domain layer (ports + entities + errors + barrel)

## Overview

Scaffold the `@dialogus/rag` package and author its domain layer per TechSpec § System Architecture and § Core Interfaces: three read-only repository ports, one `QueryEmbedder` port, three read-model entities, and the `RagError` hierarchy. This task produces only domain types — no infrastructure code, no tools, no agent logic. Subsequent tasks depend on every type exported here.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create the `packages/rag/` workspace package with `package.json` (`"type": "module"`), `tsconfig.json` extending root, and `exports` map as per the m5nita convention shared by `@dialogus/catalog` and `@dialogus/ingestion`.
- MUST declare `"@dialogus/ingestion": "workspace:*"` and `"@dialogus/db": "workspace:*"` as dependencies to enable ADR-006 structural-typing match. TechSpec lists additional runtime deps (`@mastra/core`, `@mastra/memory`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `zod`, `js-tiktoken`) — declare them in `package.json` now; actual imports land in later tasks.
- MUST create `src/domain/ports/ChunkReadRepository.port.ts`, `src/domain/ports/ChapterReadRepository.port.ts`, `src/domain/ports/ChapterSummaryReadRepository.port.ts`, `src/domain/ports/QueryEmbedder.port.ts` matching the shapes in TechSpec § Core Interfaces. Each port file exports only its `interface`, no implementation.
- MUST create `src/domain/entities/ChunkWithContext.ts`, `src/domain/entities/ChapterView.ts`, `src/domain/entities/ChapterSummaryView.ts` as `readonly` TypeScript interfaces per TechSpec § Core Interfaces. Field names use camelCase; SQL column names are handled at the adapter layer.
- MUST create `src/domain/errors/RagError.ts` extending the `DialogusError` hierarchy (from `@dialogus/shared/errors`): `SummaryNotFoundError`, `EmbeddingFailedError`.
- MUST create `src/domain/constants/citation.ts` exporting the regex constant for the `{{cite:<chunk_id>}}` marker (ADR-007) so Feature 004 can import it.
- MUST create `src/index.ts` barrel re-exporting every port, entity, and error class declared in this task. Adapters and tools stay unexported until later tasks add them.
- MUST add a single Vitest unit test asserting the package's public API surface — imports from `@dialogus/rag` resolve all expected symbols.
- Domain layer files MUST NOT import from `@dialogus/ingestion`, `@mastra/*`, `@ai-sdk/*`, or anything outside `@dialogus/shared`. Infrastructure-free.

**External prerequisite:** Feature 002 task_24 must be merged. This task does not itself import from `@dialogus/ingestion` at the value level, but sibling tasks (task_07, task_08) do, and the `DrizzleChapterSummaryRepository` from task_21 of Feature 002 must exist for those sibling tasks to compile.
</requirements>

## Subtasks

- [x] 1.1 Create the `packages/rag/` skeleton (package.json, tsconfig.json, exports map, src/ directory).
- [x] 1.2 Author the four `.port.ts` files (3 repositories + QueryEmbedder).
- [x] 1.3 Author the three entity files (ChunkWithContext, ChapterView, ChapterSummaryView).
- [x] 1.4 Author `RagError.ts` with `SummaryNotFoundError` + `EmbeddingFailedError`.
- [x] 1.5 Author `constants/citation.ts` exporting the marker regex.
- [x] 1.6 Author `src/index.ts` barrel.
- [x] 1.7 Author the public-surface smoke test.

## Implementation Details

Reference TechSpec § Core Interfaces for port + entity shapes (do not copy them here). Reference Feature 002 `@dialogus/ingestion/src/domain/` for the in-project conventions on port naming (`.port.ts` suffix), entity `readonly`-only, and error hierarchy. The `QueryEmbedder` port is unique to this package; the read-only repository ports mirror ADR-006's narrow interfaces — `searchSemantic`, `findCharacterMentions`, `findById` on `ChunkReadRepository`; `listByBook` + `findById` on `ChapterReadRepository`; `findByChapterId` on `ChapterSummaryReadRepository`.

### Relevant Files

- `packages/ingestion/package.json` — template for workspace package layout.
- `packages/ingestion/src/domain/` — template for DDD layer conventions (`.port.ts`, `readonly` entities, error subclasses).
- `packages/shared/src/errors/index.ts` — source of `DialogusError` base class.
- `.compozy/tasks/003-rag-agent/_techspec.md` § Core Interfaces — source of port + entity shapes.

### Dependent Files

- `packages/rag/package.json` (new)
- `packages/rag/tsconfig.json` (new)
- `packages/rag/src/domain/ports/*.port.ts` (new — 4 files)
- `packages/rag/src/domain/entities/*.ts` (new — 3 files)
- `packages/rag/src/domain/errors/RagError.ts` (new)
- `packages/rag/src/domain/constants/citation.ts` (new)
- `packages/rag/src/index.ts` (new — barrel)
- `packages/rag/__tests__/public-api.test.ts` (new)

### Related ADRs

- [ADR-006: @dialogus/rag depends on @dialogus/ingestion](adrs/adr-006.md) — workspace dependency declared here; actual value-level import lands in later tasks.
- [ADR-007: Inline citation markers use {{cite:<chunk_id>}}](adrs/adr-007.md) — regex constant authored here for Feature 004 reuse.

## Deliverables

- Workspace package scaffolded with 4 ports + 3 entities + 2 error classes + citation regex + barrel.
- Package compiles against TypeScript root config.
- Unit tests with 80%+ coverage **(REQUIRED)** — public-API surface smoke test.
- Integration tests **(REQUIRED)** — deferred to task_09.

## Tests

- Unit tests:
  - [x] `import * as rag from '@dialogus/rag'` exposes `ChunkReadRepository`, `ChapterReadRepository`, `ChapterSummaryReadRepository`, `QueryEmbedder` as TypeScript types (structural assertion via type-level test).
  - [x] `import { SummaryNotFoundError, EmbeddingFailedError } from '@dialogus/rag'` — both instantiate with a message and a `cause`.
  - [x] `CITATION_MARKER_REGEX.test('{{cite:01234567-89ab-cdef-0123-456789abcdef}}')` returns `true`; the `.exec()` first capture group equals the UUID.
  - [x] `CITATION_MARKER_REGEX.test('{{cite:short}}')` returns `false` (UUID v4 format enforced).
  - [x] Package compiles via `pnpm --filter @dialogus/rag typecheck`.
- Integration tests:
  - [ ] Deferred to task_09 (no adapters yet, nothing to integrate).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `packages/rag/src/domain/` contains zero infrastructure imports
- `@dialogus/rag` is importable from `apps/mastra` (verified in task_08) and exposes every symbol declared here
