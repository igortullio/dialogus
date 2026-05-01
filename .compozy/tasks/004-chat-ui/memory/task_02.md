# Task Memory: task_02.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Author Zod contracts for the Chat UI client/server boundary in `@dialogus/shared`: `ChatStreamRequest` (apps/web → apps/mastra) and `ThreadMetadata` / `ThreadMetadataUpdate` (Mastra primary path; apps/api fallback). Wire barrel + `exports` map; cover with unit tests.

## Important Decisions

- `threadMetadataUpdateSchema = threadMetadataSchema.partial()` (not just `{ custom_title?: string; pinned?: boolean }`). Keeping `custom_title: string | null` as nullable in the partial lets the UI revert to auto-title by sending `{ custom_title: null }` — a real PUT use case.
- Exports follow the existing snake_case schema-instance naming (`chatStreamRequestSchema`, `threadMetadataSchema`) to match `ingestionStatusDtoSchema` / `healthResponseSchema`. Inferred TS types use PascalCase without the `Dto` suffix because these are envelope shapes, not API DTOs.
- Re-import strategy not exercised: the spec mentioned re-importing existing book/library/catalog/chunks schemas, but only `ChunkReadDto` exists in `@dialogus/shared/schemas/ingestion.ts` so far; no new re-exports needed for this task.

## Learnings

- Zod 4.3 record syntax requires the key validator first: `z.record(z.uuid(), z.number().int().min(0))`. Tested against `'not-a-uuid'` and negative/non-int values — all reject as expected.
- Biome formatter prefers multi-line object args once a line crosses ~100 chars; tests were rewritten by `pnpm lint:fix`. Future schema tests should use multi-line object literals from the start.

## Files / Surfaces

- New: `packages/shared/src/schemas/chat.ts`, `packages/shared/src/schemas/thread.ts`
- New tests: `packages/shared/__tests__/schemas/chat.test.ts` (11 tests), `packages/shared/__tests__/schemas/thread.test.ts` (12 tests)
- Modified: `packages/shared/src/schemas/index.ts` (barrel), `packages/shared/package.json` (exports map adds `./schemas/chat` + `./schemas/thread`), `packages/shared/__tests__/exports.test.ts` (resolution coverage for both new subpaths + barrel re-export check)

## Errors / Corrections

- None substantive. Initial test files were single-line object literals; biome reformatted on `pnpm lint:fix`.

## Ready for Next Run

- task_03 (`apps/web/src/lib/api/*`) and task_05 (`useSpoilerCap` / `useThreadMetadata`) consume these schemas. They can `import { chatStreamRequestSchema, threadMetadataSchema, threadMetadataUpdateSchema } from '@dialogus/shared/schemas'` (barrel) or use the granular subpaths.
