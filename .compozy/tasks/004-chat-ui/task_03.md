---
status: completed
title: "API clients (lib/api/library, catalog, chunks, threads)"
type: frontend
complexity: medium
dependencies:
  - task_02
---

# Task 03: API clients (lib/api/library, catalog, chunks, threads)

## Overview

Author the four API client modules in `apps/web/src/lib/api/`: `library.ts` (CRUD + ingestion), `catalog.ts` (Gutendex search), `chunks.ts` (citation excerpt), and `threads.ts` (Mastra threads + metadata). Each function is typed against `@dialogus/shared/schemas` and unwraps the `{data, meta?, links?}` envelope used by `apps/api` (and the equivalent shape from `apps/mastra`).

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `apps/web/src/lib/api/library.ts` exporting:
  - `fetchLibrary(opts: { cursor?, limit?, status?, language?, includeDeleted?: boolean })` → `Promise<{ books: Book[]; nextCursor: string | null }>`.
  - `fetchBookById(id: string)` → `Promise<Book>`.
  - `addBook(gutendexId: number, idempotencyKey: string)` → `Promise<Book>`.
  - `removeBook(id: string)` → `Promise<void>`.
  - `restoreBook(id: string)` → `Promise<Book>`.
  - `startIngestion(id: string, idempotencyKey: string)` → `Promise<{ jobId: string }>`.
  - `fetchIngestionStatus(id: string)` → `Promise<IngestionStatusDto>` (from Feature 002 schema).
  - `retryIngestion(id: string, idempotencyKey: string)` → `Promise<{ jobId: string; resumingStage: string }>`.
- MUST create `apps/web/src/lib/api/catalog.ts` exporting:
  - `searchGutendex(params: { q?, language?, topic?, sort?, cursor?, limit? })` → `Promise<{ books: GutendexBook[]; nextCursor: string | null; count: number }>`.
- MUST create `apps/web/src/lib/api/chunks.ts` exporting:
  - `fetchChunkById(id: string)` → `Promise<ChunkReadDto>` (full text + chapter context).
- MUST create `apps/web/src/lib/api/threads.ts` exporting:
  - `listThreads()` → `Promise<Thread[]>` — Mastra-native list endpoint.
  - `deleteThread(id: string)` → `Promise<void>` — Mastra-native delete.
  - `updateThreadMetadata(id: string, partial: ThreadMetadataUpdate)` → `Promise<ThreadMetadata>` — uses Mastra `update-thread` if `MASTRA_THREAD_METADATA_AVAILABLE` (task_01 flag) else falls back to `PUT /api/library/threads/:id/metadata`.
  - `fetchThreadMetadata(id: string)` → `Promise<ThreadMetadata>` — same primary/fallback split.
- All clients MUST throw typed `ApiError` (with status + slug if present from RFC 9457 problem details). UI consumers (TanStack Query) catch and surface.
- All clients MUST validate responses with the relevant Zod schema; corrupt responses throw `SchemaError`.
- Base URLs read from env: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_MASTRA_URL`.
- MUST handle envelope unwrapping: `{ data, meta?, links? }` → return `data` (with `meta`/`links` accessible via separate helpers if needed for cursor pagination).

</requirements>

## Subtasks

- [x] 3.1 Author `library.ts` (8 functions).
- [x] 3.2 Author `catalog.ts` (1 function with cursor pagination helper).
- [x] 3.3 Author `chunks.ts` (1 function).
- [x] 3.4 Author `threads.ts` with primary/fallback path selection.
- [x] 3.5 Author shared helpers: `_envelope.ts` (unwrap), `_error.ts` (`ApiError`, `SchemaError`).
- [x] 3.6 Unit tests with fetch-stub endpoints for each client (project convention; MSW deferred to task_14).

## Implementation Details

Reference Feature 001 § API Endpoints for the catalog + library shapes; Feature 002 § API Endpoints for ingestion + chunks; Feature 003 ADR-006 + Feature 004 ADR-007 for thread/metadata.

The envelope unwrapping is shared logic: `{ data: T, meta?, links? }` → `data` with `meta`/`links` returned alongside when needed for pagination. Co-locate the helper in `_envelope.ts` so all four clients use the same parser.

The threads.ts conditional path selection is the trickiest piece: at module load, read `MASTRA_THREAD_METADATA_AVAILABLE` from `feature-flags.ts` (task_01) and choose the implementation. Document the chosen path in console at dev startup.

### Relevant Files

- `packages/shared/src/schemas/{book,library,ingestion,chat,thread}.ts` (Features 001 + 002 + 004 task_02) — sources of truth.
- `apps/api/src/infrastructure/http/middleware/problem.ts` (Feature 001) — RFC 9457 shape.
- `apps/web/src/lib/feature-flags.ts` (task_01) — Mastra metadata path flag.
- TechSpec § API Endpoints — endpoint inventory.

### Dependent Files

- `apps/web/src/lib/api/library.ts` (new)
- `apps/web/src/lib/api/catalog.ts` (new)
- `apps/web/src/lib/api/chunks.ts` (new)
- `apps/web/src/lib/api/threads.ts` (new)
- `apps/web/src/lib/api/_envelope.ts` (new)
- `apps/web/src/lib/api/_error.ts` (new)
- `apps/web/__tests__/lib/api/*.test.ts` (new — 4 files)

### Related ADRs

- [ADR-007: Thread metadata path selection](adrs/adr-007.md) — `threads.ts` honors the verification flag.
- [ADR-009: RSC + TanStack Query hydration](adrs/adr-009.md) — these clients are the data layer for that pattern.

## Deliverables

- 4 client modules + 2 shared helpers.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_14.

## Tests

- Unit tests (fetch stubs — project convention; MSW deferred to task_14):
  - [x] `library.fetchLibrary({})` with envelope `{ data: [book1, book2], meta: { count: 2 }, links: { next: null } }` → returns `{ books: [book1, book2], nextCursor: null }`.
  - [x] `library.addBook(996, 'key-x')` sends `Idempotency-Key: key-x` + body `{ gutendex_id: 996 }`.
  - [x] `library.startIngestion('id1', 'key-y')` returns `{ jobId: '...' }` from `data.job_id`.
  - [x] `library.fetchIngestionStatus('id1')` returns the typed Zod-parsed DTO.
  - [x] `catalog.searchGutendex({ q: 'tolstoy', language: 'en' })` queries with correct params.
  - [x] `chunks.fetchChunkById('chunk1')` returns `ChunkReadDto`; on 404 throws `ApiError` with status 404 + slug `chunk-not-found`.
  - [x] `threads.updateThreadMetadata('t1', { pinned: true })` with `MASTRA_THREAD_METADATA_AVAILABLE: true` calls Mastra endpoint; with `false` calls `apps/api` fallback.
  - [x] `threads.listThreads()` returns `Thread[]` parsed via `ThreadMetadataSchema`.
  - [x] Schema mismatch: response missing required field → throws `SchemaError`.
- Integration tests:
  - [ ] Deferred to task_14.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- All clients typed against `@dialogus/shared/schemas`.
- Each error path emits a typed error subclass; UI can branch on `instanceof`.
- `MASTRA_THREAD_METADATA_AVAILABLE` flag is read at module load (single decision point).
