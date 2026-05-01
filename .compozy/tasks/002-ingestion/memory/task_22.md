# Task Memory: task_22.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Implement two `ChapterSummaryGenerator` adapters (Anthropic + Mock), the committed `summarize.md` prompt asset, MSW unit tests, and snapshot test for the prompt. Ingestion-time Anthropic dependency authorized by Feature 002 ADR-008.

## Important Decisions

- Use `provider(modelId).doGenerate(...)` directly with custom retry loop (mirroring `OpenAIEmbeddingProvider`). Initial attempt with `generateText` from `ai` failed because `@ai-sdk/anthropic@3` returns `LanguageModelV3` while the only stable `ai@5` line still types its `model` field as `LanguageModelV2 | string`; the v2/v3 mismatch is unfixable without going to `ai@7` beta. Going low-level keeps us on stable APIs and matches the codebase memory note that prefers `doGenerate` over high-level helpers. Functional outcome is identical (429/5xx retried with exponential backoff, terminal failure surfaces `SummarizeError(retryable: true)`).
- Bottleneck default `{ maxConcurrent: 1, minTime: 2000 }` ⇒ 30 RPM. Constructor accepts `limiterOptions` override for tests (mirror `GutendexDownloader`).
- Rate-limit unit test uses default 30 RPM with 2 concurrent calls — second call serializes ≥ 2 s after the first. Avoids running 31 calls (would take ~60 s in real time) while still asserting the 2-second floor from the spec.
- System prompt loaded once at construction via `readFileSync(promptPath ?? defaultPath, 'utf8')`; passed every call with `providerOptions.anthropic.cacheControl: { type: 'ephemeral' }` on the system message for prompt caching.
- Mock returns `model: 'mock-summary-generator'`, `tokenCount = summary.length` (string length, deterministic without hashing); `summary = "Summary of <title>. [<tokenCount> tokens in source]"`.

## Learnings

- `@ai-sdk/anthropic@3` returns `LanguageModelV3` and `ai@5.x` only accepts `LanguageModelV2`. The high-level `generateText({ model })` won't typecheck against the v3 model. Stable monorepo path: skip `ai`, call `provider(modelId).doGenerate({ prompt: [...] })` directly. Same applies to `@ai-sdk/openai@3` (already used as `provider.embedding(...).doEmbed(...)`).
- `LanguageModelV3` `doGenerate` shape: `{ prompt: LanguageModelV3Prompt }` where each message is `{ role, content, providerOptions? }`. System message uses `content: string`; user uses `content: Array<{ type: 'text', text }>`. `cache_control: { type: 'ephemeral' }` is set under `providerOptions.anthropic.cacheControl` on the system message.
- Result shape: `{ content: Array<LanguageModelV3Content>, finishReason, usage, ... }`. Text comes from entries with `type: 'text'`. Errors from `doGenerate` carry `statusCode` (duck-typed via `(error as { statusCode? }).statusCode`), matching `OpenAIEmbeddingProvider`'s pattern.
- Anthropic Messages endpoint at `${baseURL}/messages` (POST). When passing custom `baseURL: 'http://anthropic.test/v1'` MSW intercepts via `http.post('http://anthropic.test/v1/messages', …)`.

## Files / Surfaces

- New: `packages/ingestion/src/infrastructure/prompts/summarize.md`
- New: `packages/ingestion/src/infrastructure/external/AnthropicChapterSummaryGenerator.ts`
- New: `packages/ingestion/src/infrastructure/external/MockChapterSummaryGenerator.ts`
- New: `packages/ingestion/__tests__/infrastructure/prompts/summarize.test.ts`
- New: `packages/ingestion/__tests__/infrastructure/external/AnthropicChapterSummaryGenerator.test.ts`
- New: `packages/ingestion/__tests__/infrastructure/external/MockChapterSummaryGenerator.test.ts`
- New: `packages/ingestion/__fixtures__/anthropic/handlers.ts`
- Modify: `packages/ingestion/package.json` (add `@ai-sdk/anthropic@^3`)

## Errors / Corrections

## Ready for Next Run

- task_23 imports `AnthropicChapterSummaryGenerator` and `MockChapterSummaryGenerator` from `@dialogus/ingestion/infrastructure/external/...` (deep import, not barrel).
- task_23 stage handler will pass `chapter` (typed as `Chapter` from domain) into `.generate(parsedChapter, language)`; `Chapter` shape and `ParsedChapter` shape align on `{ ordinal, title, plainText, tokenCount }` so reuse is direct.
