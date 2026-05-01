# Task Memory: task_05.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Implement `DrizzleChapterRepository` + `DrizzleChunkRepository` (with mappers) satisfying the ports added in task_04, including a streaming async iterator for `listByBookIdWithoutEmbedding` and a single-statement batch UPDATE for `updateEmbeddingsBatch`.

## Important Decisions

- **Streaming via keyset pagination on `chunks.id` (batch=100)** instead of postgres-js `.cursor()`. Drizzle 0.45 pg-core does not expose `.iterator()`, and `db.$client` raw cursor would lose Drizzle's vector mapping (vectors come back as raw `[1,2,3]` strings). Keyset pagination through Drizzle's standard query builder keeps memory bounded (one batch at a time) and preserves type-safe row mapping. ADR-004 requirement satisfied.
- **`updateEmbeddingsBatch` uses one `UPDATE … FROM (VALUES …)` via `db.execute(sql\`…\`)`**. Each row interpolates `${id}::uuid` and `${JSON.stringify(embedding)}::vector` (pgvector accepts the `[a,b,c]` string literal). Verified call-count = 1 in unit test.
- **Mappers do defensive copies of `embedding` arrays** (`[...row.embedding]` / `[...chunk.embedding]`) so mutating the source array does not leak into the entity / row.

## Learnings

- `vector` column in Drizzle returns `number[]` (not a string) — `mapFromDriverValue` parses `[a,b,c]` into floats. Domain `embedding: readonly number[] | null` round-trips losslessly through `$inferSelect`/`$inferInsert`.
- Mocking the Drizzle query builder for both an awaited terminal call (`listByBookId` awaits `.orderBy()`) and a chained-then-awaited call (streaming awaits `.orderBy(...).limit(N)`) requires returning a Promise-with-`.limit` (`Object.assign(Promise.resolve(rows), { limit: limitFn })`). A bare object with a `then` method triggers Biome's `noThenProperty`.
- The scaffold test in `__tests__/scaffold.test.ts` previously asserted that `@dialogus/db` was NOT a dep "until later infrastructure tasks" — task_05 is that task. Updated the assertion to require the dep.

## Files / Surfaces

- `packages/ingestion/src/infrastructure/persistence/{DrizzleChapterRepository,DrizzleChunkRepository}.ts` (new)
- `packages/ingestion/src/infrastructure/persistence/mappers/{ChapterMapper,ChunkMapper}.ts` (new)
- `packages/ingestion/__tests__/infrastructure/persistence/**/*.test.ts` (new — 4 files)
- `packages/ingestion/package.json` (added `@dialogus/db@workspace:*` + `drizzle-orm`)
- `packages/ingestion/__tests__/scaffold.test.ts` (loosened "no @dialogus/db" assertion)

## Errors / Corrections

- First test run failed on `scaffold.test.ts` ("does not yet pull in adapter libraries") — that case explicitly excluded `@dialogus/db`. Updated to require it.
- Initial test mock used a hand-rolled thenable (`{ then, limit }`) which Biome flagged as `noThenProperty`. Replaced with `Object.assign(Promise.resolve(rows), { limit })`.

## Ready for Next Run

- task_10 / task_13 (download/embed stage handlers) consume these repositories. No further repo work needed for this task.
- Integration coverage for the streaming iterator + batch UPDATE is deferred to task_16 (Testcontainers).
