# Task Memory: task_07.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Done. `OpenAIEmbeddingProvider` (real, MSW-tested) + `MockEmbeddingProvider` (deterministic) shipped. Both satisfy `EmbeddingProvider` port, `dimensions=1536`, `modelName='text-embedding-3-small'`/`mock-embedding-1536`. 105/105 tests pass; external-adapter coverage 92.9% statements / 93.24% lines.

## Important Decisions

- Used `OpenAIProvider#embedding(modelId).doEmbed({ values })` directly instead of higher-level `embedMany` from `ai`. Avoids pulling `ai` into deps and gives full retry control (`doEmbed` does no automatic retries; `embed`/`embedMany` do).
- Status-code branching: 429 → 3 attempts (1s, 2s backoff capped at 8s); 5xx → 2 attempts (1s); anything else → non-retryable `EmbedError`. Single attempt counter, classify per error.
- Status detection via duck typing on `error.statusCode: number` instead of importing `APICallError` from `@ai-sdk/provider` (which is a transitive of `@ai-sdk/openai`). Keeps the dep surface to exactly what the task asks for.
- Mock vector: SHA-256 of the input seeds an xorshift128 PRNG; produce 1536 samples in `[-1, 1)`, then L2-normalize. Deterministic, ~instant, unit-length to ≤1e-6 tolerance.

## Learnings

- MSW v2 + node response handlers: do **not** annotate the helper's return as `HttpResponse<unknown>` — MSW's `http.post(...)` resolver expects `DefaultBodyType`, and `HttpResponse<unknown>` is not assignable to it. Drop the return annotation and let TS infer.
- `as const` on a class field referring to a `const` variable fails TS1355 (`A 'const' assertion can only be applied to references to enum members, or string, number, boolean, array, or object literals.`). Use the literal inline (`readonly dimensions = 1536 as const`) instead of `readonly dimensions = DIMENSIONS as const`.
- Top-level vitest+coverage flags can be filtered to a subdirectory with `--coverage.include='src/infrastructure/external/**'` for fast targeted reports.
- `@ai-sdk/openai` provider's `OpenAIProviderSettings` accepts `apiKey`, `baseURL`, `headers`, `fetch` — the `fetch` field is the seam for MSW interception (or just rely on MSW v2 patching `globalThis.fetch`).

## Files / Surfaces

- `packages/ingestion/package.json` — added `@ai-sdk/openai@^3` dep
- `packages/ingestion/src/infrastructure/external/OpenAIEmbeddingProvider.ts` (new)
- `packages/ingestion/src/infrastructure/external/MockEmbeddingProvider.ts` (new)
- `packages/ingestion/__fixtures__/openai/handlers.ts` (new)
- `packages/ingestion/__fixtures__/openai/embed-200.json` (new — generated, 1536-dim embedding)
- `packages/ingestion/__fixtures__/openai/embed-429.json` (new)
- `packages/ingestion/__tests__/infrastructure/external/OpenAIEmbeddingProvider.test.ts` (new)
- `packages/ingestion/__tests__/infrastructure/external/MockEmbeddingProvider.test.ts` (new)
- `packages/ingestion/__tests__/scaffold.test.ts` — removed the stale `'@ai-sdk/openai' in deps` guard from task_04

## Errors / Corrections

- Initial `as const` on a referenced const variable failed typecheck — fixed by inlining the `1536` literal.
- Initial `HttpResponse<unknown>` annotation on the MSW success-builder helper failed typecheck — fixed by dropping the return type.
- task_04's scaffold test asserted `@ai-sdk/openai` must NOT be in deps (correct for that task, stale for this one); removed only that line, kept the `@gxl/epub-parser`/`epub2` guards intact.

## Ready for Next Run

- Real provider injects via `new OpenAIEmbeddingProvider({ apiKey, baseURL?, fetchImpl? })`; default `apiKey` falls back to `process.env.OPENAI_API_KEY`.
- Mock provider is a zero-arg constructor and is the right default for tasks 10-13, 15, 16 test setups.
- Both export from `infrastructure/external/`; the package barrel `src/index.ts` still does NOT re-export adapters (per task_04 constraint), so callers import via deep path (`@dialogus/ingestion/src/infrastructure/external/...`) or — once needed — via app-level wiring.
