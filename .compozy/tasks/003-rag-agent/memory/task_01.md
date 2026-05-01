# Task Memory: task_01.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Scaffold `packages/rag/` (`@dialogus/rag`) with the domain layer only — 4 ports, 3 read-model entities, 2 `RagError` subclasses, citation marker regex, barrel, and a public-API smoke test. No infrastructure, no tools, no agent factory.

## Important Decisions

- Mastra/AI-SDK runtime versions: `@mastra/core@1.28.0`, `@mastra/memory@1.17.1` (exact pins per TechSpec Known Risks); `@ai-sdk/anthropic@^3`, `@ai-sdk/openai@^3`, `js-tiktoken@^1` (matches `@dialogus/ingestion` ranges). `@dialogus/shared` declared even though task spec only enumerated `@dialogus/ingestion` + `@dialogus/db` — `RagError` extends `DialogusError` from `@dialogus/shared/errors`, so the dep is required at value level.
- `ChunkReadRepository` parameter shapes exported as named types (`SearchSemanticParams`, `FindCharacterMentionsParams`) so later tool factories can reference them directly.
- `ChapterView` includes `bookId` in addition to TechSpec's `(id, ordinal, title, tokenCount)` — consistent with the `chapters` table and avoids a follow-up structural mismatch when `DrizzleChapterRepository` from `@dialogus/ingestion` satisfies the port.
- `CITATION_MARKER_REGEX` exported with the `g` flag verbatim from ADR-007. Tests reset `lastIndex` between calls.

## Learnings

- `pnpm install` surfaces benign `@mastra/core` peer warning: its transitive `@ai-sdk/ui-utils@1.2.11` declares `zod@^3.23.8` peer but the workspace pins zod@4. Not blocking at this task; later tasks (task_07) that actually import `@mastra/core` may need to pin a newer Mastra release or accept the warning.
- Repo-wide `pnpm test` produced a transient flake in pre-existing `packages/ingestion/__tests__/infrastructure/external/GutendexDownloader.test.ts` (`bottleneck` rate-limit assertion: 996ms vs 1000ms expected). Reproduces only under parallel `pnpm -r test` CPU contention; isolated `pnpm --filter @dialogus/ingestion test` passes cleanly. Not caused by this task and not in scope to fix here.

## Files / Surfaces

- `packages/rag/package.json` — workspace package manifest (ESM, exports map, runtime deps).
- `packages/rag/tsconfig.json` — extends root tsconfig; `include` covers `src` + `__tests__`.
- `packages/rag/src/domain/ports/{ChunkReadRepository,ChapterReadRepository,ChapterSummaryReadRepository,QueryEmbedder}.port.ts`
- `packages/rag/src/domain/entities/{ChunkWithContext,ChapterView,ChapterSummaryView}.ts`
- `packages/rag/src/domain/errors/RagError.ts` (`SummaryNotFoundError`, `EmbeddingFailedError`)
- `packages/rag/src/domain/constants/citation.ts` (`CITATION_MARKER_REGEX`)
- `packages/rag/src/index.ts` — barrel; only domain symbols.
- `packages/rag/__tests__/public-api.test.ts` — 33-test smoke covering manifest, layout, infra-free guard, error semantics, regex, type-level surface.

## Errors / Corrections

- Initial type-level test used `type _ = Assert<...>` — TS6196 (`'_' declared but never used`) under `noUnusedLocals`. Replaced with value-level fixtures that satisfy each port/entity type; runtime `expect`s anchor the test.

## Ready for Next Run

- task_02 (`QueryEmbedder` adapters: OpenAI + Mock) can import the `QueryEmbedder` port from `@dialogus/rag` without further changes.
- task_07 (createDialogusAgent) will be the first task to actually import `@mastra/core`/`@mastra/memory`; revisit the zod-peer warning then.
