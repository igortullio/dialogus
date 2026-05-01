# Task Memory: task_01.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Add `@dialogus/shared/schemas/ingestion` Zod DTOs (status / chunk-read / enqueue-response) plus the 7 ingestion problem-detail slugs in the `apps/api` problem middleware. No worker, no migrations, no domain package — just the wire-contract primitives downstream tasks (task_04, task_14) will import.

## Important Decisions

- `IngestionStatus` enum carries the full post-ADR-008 superset (10 values: `discovered, downloading, cleaning, parsing, chunking, summarizing, embedding, indexing, ready, failed`). Aligns with techspec line 217 + ADR-008. Books DB enum is narrower today (no `cleaning`/`summarizing`/`indexing`); the wire DTO is the canonical contract — DB widens in task_03 (+ task_19 for `summarizing`).
- `IngestionStage` enum = 7 stages per ADR-008 (`download, clean, parse, chunk, summarize, embed, index`).
- Slug → status registry exported from `apps/api/.../middleware/problem.ts` as `INGESTION_PROBLEM_SLUGS` (7 entries) plus a `DialogusError.code → slug` lookup. Downstream tasks throw `DialogusError` subclasses with the matching codes; no need to import error classes for task_01 because none exist yet.
- `Retry-After: 60` applied to retryable 503 slugs (`ingestion-download-failed`, `ingestion-embed-failed`) — same convention as `gutendex-upstream-error`.
- `last_stage` Zod schema typed as `string | null` (matches techspec verbatim, more permissive than `IngestionStage`).
- README "API Problems" section does not exist yet (feature 001 task_18 is still pending). Created a minimal section listing the 7 new slugs; feature 002 task_18 closure regenerates it as required by its own checklist.
- Created `packages/shared/src/schemas/index.ts` barrel (didn't exist) so the root barrel imports `./schemas/index.js`. Mirrors task spec's "modify barrel" instruction.

## Learnings

- Zod 4 idiom: `z.uuid()` and `z.iso.datetime()` (top-level), not `z.string().uuid()`. Confirmed by `packages/shared/src/http/cursor.ts`.
- Existing problem middleware uses `instanceof` dispatch; new ingestion entry is a code-based dispatch placed before the default 500 fallback so existing instanceof branches stay untouched.

## Files / Surfaces

- `packages/shared/src/schemas/ingestion.ts` (new)
- `packages/shared/src/schemas/index.ts` (new barrel)
- `packages/shared/src/index.ts` (route through schemas barrel)
- `packages/shared/package.json` (add `./schemas/ingestion` + `./schemas` exports)
- `packages/shared/__tests__/schemas/ingestion.test.ts` (new)
- `packages/shared/__tests__/exports.test.ts` (extend with `./schemas/ingestion`)
- `apps/api/src/infrastructure/http/middleware/problem.ts` (new slug registry + code dispatch)
- `apps/api/__tests__/middleware/problem.test.ts` (extend with slug registry test + code-dispatch tests)
- `README.md` (create minimal API Problems section listing 7 new slugs)

## Errors / Corrections

- Initial `mapError` refactor pushed cognitive complexity above biome's threshold (19 > 15). Extracted `mapIngestionDialogusError(err, path)` helper so the router branch stays small. Lint warning gone; 5 unrelated `noTemplateCurlyInString` warnings remain in `__tests__/{ci-workflow,docker-compose}.test.ts` and predate this task.

## Ready for Next Run

- task_04 will define `@dialogus/ingestion` domain errors. Use codes that match `INGESTION_ERROR_CODE_TO_SLUG` in `apps/api/.../problem.ts`: `BOOK_NOT_IN_DISCOVERED_STATE`, `BOOK_NOT_IN_RETRYABLE_STATE`, `BOOK_ALREADY_READY`, `INGESTION_DOWNLOAD_FAILED`, `INGESTION_PARSE_FAILED`, `INGESTION_EMBED_FAILED`, `CHUNK_NOT_FOUND`. Stage failure errors (Download/Parse/Embed) live in `@dialogus/ingestion/domain/ingestion/IngestionError.ts` per techspec.
