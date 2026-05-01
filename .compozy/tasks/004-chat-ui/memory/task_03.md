# Task Memory: task_03.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

API clients in `apps/web/src/lib/api/`: `library.ts` (8 fns), `catalog.ts`, `chunks.ts`, `threads.ts` + shared `_envelope.ts`, `_error.ts`, `_schemas.ts`. All clients unwrap `{data, meta?, links?}`, validate via Zod, throw typed `ApiError` (with RFC 9457 slug) / `SchemaError`.

## Important Decisions

- Local Zod schemas live in `apps/web/src/lib/api/_schemas.ts` (`bookSchema`, `gutendexBookSchema`, `threadSchema`). Features 001/002 will eventually own these in `@dialogus/shared`; until then, web has its own copy.
- `threads.ts` calls Mastra HTTP directly (`/api/memory/threads*`) instead of going through `@mastra/client-js`. Cleaner test surface and the existing `_envelope.ts` already covers HTTP plumbing; SDK would have created two parallel layers.
- Module-level `useMastra: boolean` widens the `MASTRA_THREAD_METADATA_AVAILABLE` literal so the fallback branch type-checks. The `console.info(...)` startup signal only fires when `NODE_ENV === 'development'` AND `typeof window === 'undefined'` AND `NEXT_RUNTIME !== 'edge'` (server-side dev only).
- `retryIngestion` reuses `ingestionEnqueueResponseDtoSchema` from `@dialogus/shared/schemas/ingestion` and maps `data.stage ?? 'download'` → `resumingStage`. No separate retry schema.

## Learnings

- Tests that exercise both flag values must use `vi.resetModules()` + `vi.doMock('../../../src/lib/feature-flags', ...)` + `await import('...')`. After `resetModules()`, error classes become NEW references, so `instanceof ApiError`/`SchemaError` checks must use the classes returned from the same dynamic import — re-export them from a `loadThreads(flag)` helper.
- `fetchEnvelope<TSchema extends z.ZodType>` with `Promise<Envelope<z.infer<TSchema>>>` is the signature that lets callers see the parsed type. `ZodType<T>` (with explicit T) collapses to `unknown`.
- `apps/web` previously had no direct `zod` dependency; transitive via `@dialogus/shared` was not enough for `import { z } from 'zod'`. Added `zod ^4.0.0` to `apps/web/package.json`.

## Files / Surfaces

- `apps/web/src/lib/api/_error.ts` (new) — `ApiError`, `SchemaError`, `slugFromProblemType`, `isProblemDetails`.
- `apps/web/src/lib/api/_envelope.ts` (new) — `apiBaseUrl`, `mastraBaseUrl`, `fetchEnvelope`, `fetchVoid`, `nextCursorFromLinks`.
- `apps/web/src/lib/api/_schemas.ts` (new) — local Book/GutendexBook/Thread schemas.
- `apps/web/src/lib/api/library.ts` (new) — 8 functions.
- `apps/web/src/lib/api/catalog.ts` (new) — `searchGutendex`.
- `apps/web/src/lib/api/chunks.ts` (new) — `fetchChunkById`.
- `apps/web/src/lib/api/threads.ts` (new) — `listThreads`, `deleteThread`, `updateThreadMetadata`, `fetchThreadMetadata`.
- `apps/web/__tests__/lib/api/{_fixtures,library,catalog,chunks,threads}.{ts,test.ts}` (new) — 28 tests, fetch-stub style.
- `apps/web/package.json` — added `zod ^4.0.0`.

## Errors / Corrections

- First `pnpm test` surfaced a pre-existing flaky timing test in `packages/ingestion` (`GutendexDownloader.test.ts` rate-limit, expected `≥1000ms` got `996ms`). Re-run passed 13/13. Unrelated to task_03.

## Ready for Next Run

- task_05 (`useThreadMetadata`) can call `updateThreadMetadata` / `fetchThreadMetadata` directly; the path-selection logic lives inside `threads.ts`.
- task_07 (assistant-ui glue) and task_12 (library page) consume these clients via TanStack Query; envelope unwrapping is already done.
- task_14's MSW-based integration suite can replace the fetch stubs if richer response sequencing is needed.
