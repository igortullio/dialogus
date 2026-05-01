# Task Memory: task_06.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Ship `packages/rag/src/prompts/system.md` (committed Markdown asset), `loader.ts` (cached `readFileSync` singleton), and `__tests__/prompts/system.test.ts` snapshot-style. Re-export `loadSystemPrompt` from the package barrel.

## Important Decisions

- **Cache singleton via module-level `let cached: string | null`** mirroring the established `chapter-heuristics.ts` loader pattern. Exposes `_resetSystemPromptCache()` test seam (underscore prefix matches the ingestion convention).
- **Token budget landed at 1923** (cl100k_base). First draft at 2118 was over the 2000 cap; trimmed prose without losing any of the six required sections.
- **Schematic citation examples only** — replaced the initial "Call me Ishmael." quote and "Ishmael meets Queequeg" sentence with placeholder phrasing (`<claim grounded in two chunks>`, `<sentence supported by retrieval>`) per task spec rule "MUST NOT include any example responses that look like real book content".
- **Prompt is in English** even though responses can be PT — instruction language vs. output language are independent (per task spec implementation note).

## Learnings

- Biome's `assist/source/organizeImports` enforces alphabetical export order in `src/index.ts`; `pnpm lint:fix` resolved it in one pass after the manual placement of the new barrel export.
- `js-tiktoken` is not installed at the repo root, only inside `packages/rag` (and other workspace packages). Ad-hoc `node -e` token counts must run from a package directory that declares it as a dep.

## Files / Surfaces

- `packages/rag/src/prompts/system.md` (new, ~9KB Markdown asset)
- `packages/rag/src/prompts/loader.ts` (new, `loadSystemPrompt` + `_resetSystemPromptCache` test seam)
- `packages/rag/__tests__/prompts/system.test.ts` (new, 12 cases — file existence, non-empty, cache identity, [500, 2000] token range, six section patterns via `it.each`, citation marker literal + canonical form, no TODO/FIXME)
- `packages/rag/src/index.ts` (modified, added `loadSystemPrompt` barrel export, then re-sorted by Biome)

## Errors / Corrections

- First prompt draft tokenised to 2118; trimmed § 1 / § 6 / § 7 / § 8 prose to land at 1923 with comfortable headroom under the 2000 cap.
- First draft included real book content (`"Call me Ishmael."` quote + Ishmael/Queequeg chapter-10 example). Replaced with placeholder phrasing per task spec.
- After adding the barrel export at the end of `src/index.ts`, Biome flagged `organizeImports`; `pnpm lint:fix` reordered it (functionally equivalent placement).

## Ready for Next Run

- Task_07 (`createDialogusAgent`) imports `loadSystemPrompt` from the `@dialogus/rag` barrel — `instructions: loadSystemPrompt()` shape. Loader is sync; safe at module-init time.
- Snapshot test guards regressions (token budget + required sections) so task_07 can iterate the agent without worrying about the prompt drifting silently.
