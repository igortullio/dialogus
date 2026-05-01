# Task Memory: task_04.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Scaffold `@dialogus/ingestion` with hexagonal layout, domain entities (`Chapter`, `Chunk`), 4 ports (`ChapterRepository`, `ChunkRepository`, `EmbeddingProvider`, `ChapterParser`), and 6 stage error classes — domain only, no infrastructure.

## Important Decisions

- **Repository ports include the methods task_05 will need** (`countByBookId` on both ports; `updateEmbeddingsBatch` + `ChunkEmbeddingUpdate` on `ChunkRepository`). Task_04's spec lists "saveMany / listByBookId / listByBookIdWithoutEmbedding / findById" as inferred-from-stage-needs, and task_05 explicitly requires the extras "satisfying ChapterRepository port" — so the port is authored once here, and task_05 is unblocked without amending the contract.
- **`IngestionError.ts` uses an in-file abstract `IngestionStageError`** (not exported) extending `DialogusError`. Each of the 6 classes extends the abstract base. Constructor accepts `(message, options?: { cause?, retryable? })` and exposes a per-stage `retryable` boolean. Defaults: download/embed → true, clean/parse/chunk/index → false. Override is allowed via the options bag.
- **Empty infra folders carry `.gitkeep`** so `scaffold.test.ts`'s folder existence assertions are robust on a fresh clone (catalog has the same test but no `.gitkeep` — pre-existing fragility we did not propagate).
- **Barrel does NOT export `IngestionStageError`** (private); it does export `IngestionErrorOptions` so adapters in tasks 6/7/13 can construct stage errors with overrides.

## Learnings

- `noUnusedParameters` does flag unused destructured fields in `describe.each` callbacks; using each field (incl. via `expect(err.name).toBe(name)`) avoids a lint failure cleanly.
- Biome's `assist/source/organizeImports` re-orders both `import { ... }` lists and `export { ... }` lists; alphabetised these by hand-running `pnpm lint:fix` after first authoring.
- `pnpm install` after creating a new workspace dir under `packages/*` is enough to wire it into the resolver — no additional change to `pnpm-workspace.yaml` (already globs `packages/*`).
- Pre-existing repo-root lint warnings live in `__tests__/{ci-workflow,docker-compose}.test.ts` (5× `noTemplateCurlyInString`); they are warnings only and don't fail `pnpm lint`.

## Files / Surfaces

- New package: `packages/ingestion/{package.json,tsconfig.json}`.
- New domain types/ports: `src/domain/{chapter,chunk,embedding,parser}/*.ts`.
- New errors: `src/domain/ingestion/IngestionError.ts`.
- New barrel: `src/index.ts`.
- New `.gitkeep`s: `src/application/stages/`, `src/infrastructure/{persistence,external,parsing}/`.
- New tests: `__tests__/scaffold.test.ts`, `__tests__/domain/ingestion/IngestionError.test.ts` (44 cases, 100% coverage).

## Errors / Corrections

- First lint pass failed: import ordering + line-wrap on the `STAGE_ERRORS` table. Resolved with `pnpm lint:fix` (auto-fixable), then re-verified.

## Ready for Next Run

- task_05 (persistence) can implement `DrizzleChapterRepository` + `DrizzleChunkRepository` against the ports as authored — no port modifications expected.
- task_06/07/13 (adapters + stage handlers) can throw the 6 `*Error` classes and pass `{ retryable, cause }` options without redefining the contract.
