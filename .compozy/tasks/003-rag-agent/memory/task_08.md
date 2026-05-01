# Task Memory: task_08.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Scaffold `apps/mastra` Dev Server with `mastra.config.ts` + `src/mastra/index.ts` discovery, wire `dialogusAgent` from `@dialogus/rag`, attach `@mastra/pg` `PostgresStore`, extend env + `/health`, parallelise root `pnpm dev`.

## Status

- **Complete.** Committed as `b40e3a0 feat(mastra): scaffold apps/mastra Dev Server + wire dialogusAgent + extend /health [T008]`.
- All tests verified: apps/mastra 47/47, @dialogus/shared 161/161, @dialogus/api 113/113, @dialogus/rag 115/115.
- Biome lint clean (7 pre-existing shadcn Slider warnings, not in task scope). TypeCheck clean.

## Important Decisions

- **CLI entry**: pinned `mastra@1.6.3` discovers `src/mastra/index.ts`, NOT `mastra.config.ts`. Shipped both — `src/mastra/index.ts` re-exports the wired `mastra` from `src/index.ts`; `mastra.config.ts` re-exports it for tests + literal task-spec compliance.
- **Storage class is `PostgresStore`** (NOT `PgStorage` as the techspec referenced); imported from `@mastra/pg@1.9.2`. Constructor takes `{ id, connectionString }`; lazy-init.
- **Read-side adapters live in `apps/mastra/src/persistence/`** (`DialogusChunkReadAdapter`, `DialogusChapterReadAdapter`, `DialogusChapterSummaryReadAdapter`). Diverged from the task's literal "use `Drizzle*Repository` from `@dialogus/ingestion`" because those write-side adapters have conflicting type shapes with the rag read-port shapes.
- **Health probe for Mastra is failure-tolerant**: 1s timeout + AbortController; rejection or non-ok responses report `mastra: 'down'` without affecting other probes.

## Learnings

- **`async` matters for `rejects.toThrow`**: a method that throws synchronously cannot be tested with `rejects` matchers. Mark adapter stubs `async` so the throw becomes a rejected Promise.
- **`LOG_LEVEL='silent'`** was rejected by envSchema; use `'error'` in tests.

## Files / Surfaces

- `apps/mastra/package.json`, `apps/mastra/tsconfig.json` (new).
- `apps/mastra/src/index.ts`, `apps/mastra/src/mastra/index.ts`, `apps/mastra/mastra.config.ts` (new).
- `apps/mastra/src/persistence/{DialogusChunkReadAdapter,DialogusChapterReadAdapter,DialogusChapterSummaryReadAdapter,index}.ts` (new).
- `apps/mastra/__tests__/boot.test.ts`, `apps/mastra/__tests__/persistence/*.test.ts` (new).
- `packages/shared/src/config/index.ts` (added MASTRA_PORT, MASTRA_STUDIO_PORT; defaulted NEXT_PUBLIC_MASTRA_URL).
- `packages/shared/src/schemas/health.ts` (added `mastra` field).
- `apps/api/src/infrastructure/http/routes/health.ts` (probeMastra + new route deps).
- Root `package.json` (added `--filter @dialogus/mastra` to `dev`).
