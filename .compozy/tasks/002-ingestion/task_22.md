---
status: completed
title: AnthropicChapterSummaryGenerator + Mock + prompt asset
type: backend
complexity: medium
dependencies:
  - task_20
---

# Task 22: AnthropicChapterSummaryGenerator + Mock + prompt asset

## Overview

Implement the two adapters of the `ChapterSummaryGenerator` port (task_20): `AnthropicChapterSummaryGenerator` (production adapter calling Claude Haiku 4.5 via `@ai-sdk/anthropic`, rate-limited with `bottleneck`) and `MockChapterSummaryGenerator` (deterministic test double). Ship the committed Markdown prompt asset `summarize.md` that defines the scholarly academic tone, language-matching behavior, and 150-300-word target per chapter. Feature 002 ADR-008 authorizes Anthropic as an ingestion-time dependency.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/ingestion/src/infrastructure/prompts/summarize.md` — committed Markdown asset loaded at generator construction. Required sections (snapshot-tested):
  - Tone: scholarly, neutral, factual, no spoilers of later chapters (self-contained to the chapter being summarized).
  - Language: summary language matches the chapter language exactly.
  - Length: 150–300 words; trim when possible.
  - Format: single paragraph, no bullet lists, no citations (the RAG agent handles citations at query time).
- MUST implement `packages/ingestion/src/infrastructure/external/AnthropicChapterSummaryGenerator.ts` satisfying `ChapterSummaryGenerator` (task_20):
  - Uses `@ai-sdk/anthropic` with model `claude-haiku-4-5`.
  - Loads `summarize.md` once at construction; applies via prompt caching (ephemeral 5-min TTL).
  - Rate-limited via `bottleneck` at 30 RPM (single global limiter on the adapter instance; serial ingestion means only one worker hits this at a time, but limiter is defensive against bursts).
  - Returns `{ summary, tokenCount, model }`. Token count via `js-tiktoken` (already in deps from task_08) on the summary text.
  - Retries handled by `@ai-sdk/anthropic` built-in retry; 429 surfaces as `SummarizeError` with `retryable: true`.
- MUST implement `packages/ingestion/src/infrastructure/external/MockChapterSummaryGenerator.ts` satisfying the port:
  - Deterministic: `summary = \`Summary of ${chapter.title}. [${chapter.tokenCount} tokens in source]\`` (or equivalent).
  - Returns `{ model: 'mock-summary-generator', tokenCount: hash(summary).length }`.
  - No network calls; used by all ingestion integration tests.
- MUST add `bottleneck@^2` to `packages/ingestion/package.json` if not already present (task_06 may have added it for Gutendex — verify and reuse if so).
- MUST add `@ai-sdk/anthropic` to `packages/ingestion/package.json` deps.
- MUST add snapshot test verifying `summarize.md` contains the required section keywords (Tone, Language, Length, Format) and is ≤ 1500 tokens.

</requirements>

## Subtasks

- [x] 22.1 Author `summarize.md` prompt asset.
- [x] 22.2 Implement `AnthropicChapterSummaryGenerator.ts`.
- [x] 22.3 Implement `MockChapterSummaryGenerator.ts`.
- [x] 22.4 Package deps + snapshot test for prompt asset.
- [x] 22.5 Unit tests with MSW-mocked Anthropic for the real adapter.

## Implementation Details

Use `@ai-sdk/anthropic`'s `cache_control: { type: 'ephemeral' }` on the system prompt to take advantage of Anthropic's prompt caching — the summarize-stage system prompt is the exact same text for every chapter, so cache hit rate should be near 100% within a ~5-minute window (one long-book summarize run fits comfortably in the TTL). Per-chapter prompt adds only the chapter text; cache-keyed on the system-prompt prefix.

Rate-limit rationale (ADR-008): 30 RPM is conservative for Anthropic Tier-1; leaves headroom for concurrent embed-stage retries. If ingestion throughput becomes a problem on long books, limiter can bump in a Phase 2 tuning pass.

### Relevant Files

- Feature 002 ADR-008: [Anthropic as ingestion dep; rate-limiter commitment](adrs/adr-008.md).
- `packages/ingestion/src/domain/chapter_summary/ChapterSummaryGenerator.port.ts` (from task_20).
- `packages/ingestion/src/infrastructure/external/OpenAIEmbeddingProvider.ts` (from task_07) — template for `@ai-sdk/*` adapter shape.
- `packages/ingestion/src/infrastructure/external/GutendexDownloader.ts` (from task_06) — template for `bottleneck` usage.

### Dependent Files

- `packages/ingestion/src/infrastructure/prompts/summarize.md` (new)
- `packages/ingestion/src/infrastructure/external/AnthropicChapterSummaryGenerator.ts` (new)
- `packages/ingestion/src/infrastructure/external/MockChapterSummaryGenerator.ts` (new)
- `packages/ingestion/package.json` (modify: deps + versions)
- `packages/ingestion/__tests__/infrastructure/external/AnthropicChapterSummaryGenerator.test.ts` (new)
- `packages/ingestion/__tests__/infrastructure/prompts/summarize.test.ts` (new — snapshot)

### Related ADRs

- [Feature 002 ADR-008](adrs/adr-008.md) — authorizes this adapter + its deps.

## Deliverables

- Two adapter implementations.
- Committed prompt asset.
- Deps + version pins.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_23 / task_16.

## Tests

- Unit tests:
  - [ ] `summarize.md` snapshot — file exists, ≤ 1500 tokens via `js-tiktoken`, contains the 4 required section keywords.
  - [ ] `AnthropicChapterSummaryGenerator.generate(chapter, 'en')` — MSW-mocked Anthropic 200 response → returns `{ summary, tokenCount, model }`.
  - [ ] Same for `'pt'`.
  - [ ] MSW-mocked 429 → `@ai-sdk/anthropic` retries (smoke: asserts no throw after 2 simulated 429s followed by 200).
  - [ ] MSW-mocked persistent 500 → throws `SummarizeError` with `retryable: true`.
  - [ ] `bottleneck` limiter: 31 concurrent `generate()` calls → total duration ≥ 2 seconds (30 RPM enforced).
  - [ ] `MockChapterSummaryGenerator.generate(chapter, ...)` — deterministic: same chapter twice → identical result.
- Integration tests:
  - [ ] Deferred to task_23 (full summarize stage).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- No real Anthropic calls in unit tests (MSW only)
- Prompt asset is PR-reviewable as documentation-friendly Markdown
- `MockChapterSummaryGenerator` fast enough (< 1ms/call) to not slow down downstream integration tests
