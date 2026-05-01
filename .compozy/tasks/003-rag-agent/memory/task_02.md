# Task Memory: task_02.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Implement `QueryEmbedder` adapters per TechSpec § Component Overview: production `OpenAIQueryEmbedder` (`text-embedding-3-small`, 1536d, single-call) and deterministic `MockQueryEmbedder` (SHA-256-seeded xorshift, unit-length).

## Important Decisions

- Lifted xorshift128 + SHA-256 unit-vector helper pattern from `MockEmbeddingProvider` (ingestion) — adapted to single-string signature. Per task spec we MUST NOT reuse Feature 002 adapters, but copying a tiny self-contained PRNG implementation is acceptable; refactoring it into a shared util was rejected as premature.
- `OpenAIQueryEmbedder` mirrors `OpenAIEmbeddingProvider`'s retry shape (3-attempt 429, 2-attempt 5xx, exponential backoff with `sleep` injection) but on a single value via `model.doEmbed({ values: [query] })`. Errors map to `EmbeddingFailedError` (RAG domain) instead of `EmbedError` (ingestion). Cognitive complexity capped under the Biome max=15 by extracting `handleAttemptFailure` from the retry loop.
- Empty-query input rejected with `EmbeddingFailedError` before any network call — defensive guard that costs one branch and avoids wasting an OpenAI request on an obviously broken caller.

## Learnings

- task_01's `public-api.test.ts` enforced "no `src/infrastructure` directory yet" and "no `infrastructure` mention in `index.ts`". Both guards needed to relax this task: dropped the `src/infrastructure` existence assertion (kept `src/application`-must-not-exist) and removed `not.toMatch(/infrastructure/)` from the barrel-content guard while keeping the `@mastra/` and `@ai-sdk/` guards.
- `packages/rag/__fixtures__/openai/handlers.ts` lives outside `src` and `__tests__` but tsc still type-checks it transitively via the test imports — same pattern the ingestion package already uses; no tsconfig change required.

## Files / Surfaces

- New: `packages/rag/src/infrastructure/embedding/{OpenAIQueryEmbedder,MockQueryEmbedder}.ts`
- New: `packages/rag/__fixtures__/openai/handlers.ts` (msw mocks; no JSON fixture file — embedding generated inline via `Math.sin` to keep the fixture self-contained)
- New: `packages/rag/__tests__/infrastructure/embedding/{OpenAIQueryEmbedder,MockQueryEmbedder}.test.ts`
- Modified: `packages/rag/src/index.ts` (re-exports), `packages/rag/package.json` (`msw` devDep), `packages/rag/__tests__/public-api.test.ts` (relaxed guards), `pnpm-lock.yaml` (msw added)

## Errors / Corrections

- First lint pass surfaced cognitive complexity 16 > 15 on `embed()`. Resolved by extracting `handleAttemptFailure(error, attempt) -> Promise<number>`. Format violation in the same file auto-fixed by `pnpm exec biome check --write packages/rag`.

## Ready for Next Run

- task_03 (semantic_search tool) can import `OpenAIQueryEmbedder` and `MockQueryEmbedder` directly from `@dialogus/rag` barrel; no relative paths required.
- Pattern for next adapter task: keep cognitive complexity ≤ 15 (Biome cap); split retry/error handling into helper methods.
