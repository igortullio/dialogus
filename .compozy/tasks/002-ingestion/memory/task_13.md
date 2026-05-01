# Task Memory: task_13.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Implement `embedStage` (stage 5 of pre-ADR-008 numbering, stage 6 post-ADR-008) and `indexStage` (terminal) in `packages/ingestion/src/application/stages/`.
- Both must respect ADR-003 idempotency and ADR-004 streaming.

## Important Decisions

- Added `countByBookIdWithoutEmbedding(bookId): Promise<number>` to `ChunkRepository` port (task_05 surface) so `embedStage` can compute total batches up front without double-streaming the unembedded set. Drizzle impl uses `count(*)::int … WHERE book_id = $1 AND embedding IS NULL`.
- `embedStage` enqueues `ingestion.index` (NOT `ingestion.summarize`); summarize stage is task_23's amendment and slots between chunk and embed per ADR-008.
- `indexStage` does not depend on `pgboss` (terminal). Its `IndexStageDeps` Pick narrowing is the slimmest of all stages: just `db | logger`.
- VACUUM ANALYZE is run via `db.execute(sql\`VACUUM ANALYZE chunks\`)` outside any transaction. Drizzle's `db.execute` on `postgres.js` runs as a top-level statement, which is what pgvector's HNSW maintenance needs.
- Final pipeline log: `total_duration_ms = indexedAt - book.ingestionStartedAt`; null-safe when `ingestionStartedAt` is missing (degenerate manual case).

## Learnings

- Embed-stage progress must use the count of CURRENTLY pending chunks (not total chunks), so retries report 0→100% across the remaining batches rather than starting at "60% already done." `countByBookIdWithoutEmbedding` is the right denominator.
- Test-side: Drizzle's `sql\`...\`` template object exposes `queryChunks: [{ value: [...strings] }]`. Asserting against a flattened concatenation of `value` strings is enough to verify the statement contains `VACUUM ANALYZE chunks`.

## Files / Surfaces

- Added: `packages/ingestion/src/application/stages/embed.ts`, `packages/ingestion/src/application/stages/index.ts`.
- Added: `packages/ingestion/__tests__/application/stages/embed.test.ts`, `packages/ingestion/__tests__/application/stages/index.test.ts`.
- Touched (port + impl): `packages/ingestion/src/domain/chunk/ChunkRepository.port.ts`, `packages/ingestion/src/infrastructure/persistence/DrizzleChunkRepository.ts` (+`countByBookIdWithoutEmbedding`).
- Touched (test mocks): `packages/ingestion/__tests__/application/stages/chunk.test.ts`, `packages/ingestion/__tests__/infrastructure/persistence/DrizzleChunkRepository.test.ts`.

## Errors / Corrections

- Initial draft used a two-pass count over the streaming iterator (consumed the iterator once for counting, then again for processing). Replaced with a port method to avoid the wasted IO.

## Ready for Next Run

- task_15 (worker registration) wires `embedStage` and `indexStage` into apps/worker. The new `EmbedStageDeps`/`IndexStageDeps` Pick narrowings expect: `embedStage` needs `db, logger, pgboss, chunkRepo, embeddingProvider`; `indexStage` needs only `db, logger`.
