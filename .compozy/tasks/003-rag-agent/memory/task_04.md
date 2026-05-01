# Task Memory: task_04.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Ship two thin Mastra read-only tools: `list_chapters` and `get_chapter_summary` under `packages/rag/src/application/tools/`.
- Both follow the `semanticSearch.ts` factory pattern: snake_case Zod IO + inline `Logger` interface + structured `tool_call` event log + thread-id awareness.
- Single error path on `getChapterSummary`: `null` repo result → throw `SummaryNotFoundError` with chapter_id in message.

## Important Decisions

- `listChapters` sorts by `ordinal` ascending in the tool itself (defensive — repo contract does not promise ordering).
- `getChapterSummary` outputs `generated_at` as ISO string (`Date.toISOString()`); zod schema declares `z.string()` because the wire shape is JSON-friendly.
- Reused inline `Logger` interface per tool (`ListChaptersLogger`, `GetChapterSummaryLogger`) to mirror `SemanticSearchLogger` pattern — no shared module yet, per workflow shared decision.
- `getChapterSummary` error path emits a single error log (not an info `hit:false` log) — matches task spec wording.

## Learnings

- Biome's import-organizer wants type-imports interleaved alphabetically (e.g., value `SummaryNotFoundError` from `errors/RagError` sorts BEFORE the type import from `ports/...`). Run `pnpm lint:fix` after authoring tool files; auto-fix is safe.

## Files / Surfaces

- new `packages/rag/src/application/tools/listChapters.ts`
- new `packages/rag/src/application/tools/getChapterSummary.ts`
- modified `packages/rag/src/index.ts` (barrel adds two tool factory groups)
- new `packages/rag/__tests__/application/tools/listChapters.test.ts`
- new `packages/rag/__tests__/application/tools/getChapterSummary.test.ts`

## Errors / Corrections

- None.

## Ready for Next Run

- task_05 (`find_character_mentions` tool) follows the same pattern; reuses `ChunkReadRepository.findCharacterMentions`.
- task_07 (`createDialogusAgent`) imports both new factories from the barrel; deps shape is `{ chapterRepo, logger }` for `listChaptersTool` and `{ chapterSummaryRepo, logger }` for `getChapterSummaryTool`.
