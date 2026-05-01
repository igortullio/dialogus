# Task Memory: task_05.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Implement `find_character_mentions` Mastra tool factory under `@dialogus/rag/application/tools/`. Thin wrapper over `ChunkReadRepository.findCharacterMentions` — case/diacritics-insensitive substring search across one or more books, earliest chapters first.

## Important Decisions

- Reused `chunkWithContextSchema` from `semanticSearch.ts` (single source of truth for the snake-case chunk DTO).
- Did NOT truncate `excerpt_preview` in this tool. semantic_search trims to 200 chars for transport efficiency; that requirement is tool-specific (per task_03), and task_05 does not require it. Pass-through preserves whatever the repo's `ChunkWithContext.excerptPreview` already holds.
- Did NOT export `toSemanticSearchChunk` for reuse — the 8-line mapper is duplicated in `findCharacterMentions.ts` (own `toMentionDto`). Reasoning: the shared schema enforces the shape; the mapper is purely a field-rename + already-trivial. Sharing would force a touch on a stable, completed task_03 file for marginal value.
- Followed the inline pino-shaped `Logger` interface convention (info/error meta+msg) per shared decision; structured `tool_call` event with the exact monitoring fields named in TechSpec § Monitoring (`book_ids`, `alias_count`, `returned_count`, `duration_ms`, optional `thread_id`).

## Learnings

- `z.array(z.string().min(1)).min(1)` correctly rejects both `aliases: []` and `aliases: ['']` at the Zod boundary — confirmed via the two dedicated input-validation tests.
- The `.default(20)` flatten quirk noted in shared memory still applies: TS infers `input.limit` as `number | undefined` even though Zod always supplies the default at runtime. Used the `input.limit ?? FIND_CHARACTER_MENTIONS_DEFAULT_LIMIT` runtime fallback that is now the standard pattern in this package.
- `Found 5 warnings` from `pnpm lint` are all pre-existing in `docker-compose.test.ts` and ingestion test files; lint exit is clean (0 errors) on this task's diff.

## Files / Surfaces

- New: `packages/rag/src/application/tools/findCharacterMentions.ts`
- New: `packages/rag/__tests__/application/tools/findCharacterMentions.test.ts` (16 tests, 96% statements / 96% lines / 100% functions)
- Modified: `packages/rag/src/index.ts` (barrel — added 11 exports for the new tool)
- Verified untouched: `packages/rag/src/domain/ports/ChunkReadRepository.port.ts` already declares `findCharacterMentions` (task_01).

## Errors / Corrections

- Initial draft used a multi-line call style that biome's formatter rewrote to single-line; auto-fix accepted.
- No semantic corrections required.

## Ready for Next Run

- task_06 (system prompt asset) is next per `_tasks.md`. It's independent of the four tools and can ship alongside.
- task_07 (`createDialogusAgent` factory) consumes `findCharacterMentionsTool` via the package barrel; deps shape is `{ chunkRepo, logger }` — no embedder, no chapter repos. Same logger interface as the other three tools.
- Reminder for task_08 wiring: Feature 002's `DrizzleChunkRepository` still lacks `searchSemantic` and `findCharacterMentions`; runtime wiring blocks until those SQL adapters land (see shared memory Open Risks).
