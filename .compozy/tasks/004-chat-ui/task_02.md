---
status: completed
title: "@dialogus/shared/schemas/{chat,thread} Zod contracts"
type: backend
complexity: low
dependencies:
  - task_01
---

# Task 02: @dialogus/shared/schemas/{chat,thread} Zod contracts

## Overview

Author Zod schemas for the request/response shapes the Chat UI exchanges with `apps/mastra` and consumes from `apps/api`. Specifically: chat-stream request body (`{ message, book_ids, spoiler_caps, thread_id? }`), thread metadata DTO (`{ custom_title, pinned }`), and any UI-specific re-exports of existing library/catalog/chunks schemas. Lives in `@dialogus/shared/schemas/` to share the same envelope conventions as Features 001 + 002.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/shared/src/schemas/chat.ts` exporting:
  - `ChatStreamRequestSchema`: Zod object for `{ message: string.min(1), book_ids: array(uuid).min(1), spoiler_caps: record(uuid, int.min(0)).optional(), thread_id: uuid.optional() }`.
  - Inferred TypeScript type `ChatStreamRequest`.
- MUST create `packages/shared/src/schemas/thread.ts` exporting:
  - `ThreadMetadataSchema`: `{ custom_title: string.nullable(), pinned: boolean }`.
  - `ThreadMetadataUpdateSchema`: `{ custom_title?: string, pinned?: boolean }` (partial for PUT).
  - Inferred types.
- MUST extend `packages/shared/src/index.ts` barrel + `package.json` `exports` map to expose `./schemas/chat` and `./schemas/thread`.
- MUST NOT duplicate existing schemas (book, library, ingestion, catalog) — those already live in `@dialogus/shared/schemas/` from Features 001 + 002. Re-import as needed.

</requirements>

## Subtasks

- [x] 2.1 Author `chat.ts` schema + types.
- [x] 2.2 Author `thread.ts` schema + types.
- [x] 2.3 Extend `@dialogus/shared` barrel + `package.json` exports.
- [x] 2.4 Unit tests for parse/round-trip cases.

## Implementation Details

Reference Feature 003's `apps/mastra` request body shape (TechSpec § Data flow — ask a grounded question, step 2) for `ChatStreamRequest`. Reference Feature 004 ADR-007 for `ThreadMetadata` shape.

These schemas are the contract between `apps/web` (consumer) and `apps/mastra` (producer for chat) + `apps/api` (producer for thread metadata fallback). The shapes must round-trip cleanly through JSON; no `Date` objects (use ISO strings); no functions; no class instances.

### Relevant Files

- `packages/shared/src/schemas/book.ts` (Feature 001 task_01) — existing convention.
- `packages/shared/src/schemas/library.ts` (Feature 001 task_01) — re-imported in lib/api clients.
- `packages/shared/src/schemas/ingestion.ts` (Feature 002 task_01) — re-imported.
- `packages/shared/src/schemas/health.ts` (Foundation task_03) — convention reference.

### Dependent Files

- `packages/shared/src/schemas/chat.ts` (new)
- `packages/shared/src/schemas/thread.ts` (new)
- `packages/shared/src/index.ts` (modify: barrel)
- `packages/shared/package.json` (modify: exports map)
- `packages/shared/__tests__/schemas/chat.test.ts` (new)
- `packages/shared/__tests__/schemas/thread.test.ts` (new)

### Related ADRs

- [ADR-007: Thread metadata primary path](adrs/adr-007.md) — `ThreadMetadata` shape.
- Feature 003 [ADR-006: per-request spoiler_caps](../003-rag-agent/adrs/adr-006.md) — `spoiler_caps` shape on `ChatStreamRequest`.

## Deliverables

- 2 new schema files + barrel updates.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_14.

## Tests

- Unit tests:
  - [x] `ChatStreamRequestSchema.parse({ message: 'hi', book_ids: ['<uuid>'] })` → success.
  - [x] `ChatStreamRequestSchema.parse({ message: '', book_ids: ['<uuid>'] })` → fail (empty message).
  - [x] `ChatStreamRequestSchema.parse({ message: 'hi', book_ids: [] })` → fail (empty book_ids).
  - [x] `ChatStreamRequestSchema.parse({ message: 'hi', book_ids: ['not-a-uuid'] })` → fail (invalid uuid).
  - [x] `ChatStreamRequestSchema.parse({ message: 'hi', book_ids: ['<uuid>'], spoiler_caps: { '<uuid>': 5 } })` → success.
  - [x] `ThreadMetadataSchema.parse({ custom_title: 'foo', pinned: true })` → success.
  - [x] `ThreadMetadataSchema.parse({ custom_title: null, pinned: false })` → success.
  - [x] `ThreadMetadataUpdateSchema.parse({ pinned: true })` → success (partial).
  - [x] `ThreadMetadataUpdateSchema.parse({})` → success (all optional).
- Integration tests:
  - [ ] Deferred to task_14.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- New schemas importable from `@dialogus/shared` barrel.
- Inferred types align with the request shapes documented in Feature 003 + 004 TechSpecs.
