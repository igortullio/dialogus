# Task Memory: task_07.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- `createDialogusAgent(deps: AgentDeps): Agent` factory composing the 4 tools, system prompt with Anthropic ephemeral cache, model selection, and Mastra Memory placeholder. Final `@dialogus/rag` barrel exports.

## Important Decisions

- Memory placeholder uses `new Memory()` from `@mastra/memory` with no storage; storage is attached by the parent Mastra instance at registration time (task_08 wiring).
- System prompt is attached as a `SystemModelMessage` (`{ role: 'system', content, providerOptions }`) so Anthropic `cacheControl: { type: 'ephemeral' }` rides on `providerOptions.anthropic`. The AI SDK key is camelCase `cacheControl`; the wire format is `cache_control`.
- Tool registry keys reuse the `*_TOOL_ID` constants exported from each tool factory module — keeps the canonical names in one place.
- Public barrel exports `createDialogusAgent` only via `./application/createDialogusAgent`; no `@mastra` or `@ai-sdk` import appears in `src/index.ts` (enforced by `__tests__/public-api.test.ts`).

## Learnings

- `Agent.getModel()` on Mastra 1.28.0 returns the resolved `LanguageModelV3`; the `.modelId` field is the Anthropic model string. Sufficient for asserting model selection without API calls.
- Anthropic provider `anthropic('claude-haiku-4-5')` constructs the model lazily — no API key validation at instantiation, so unit tests run without `ANTHROPIC_API_KEY`.
- Vitest `vi.mock('node:fs', async (importOriginal) => ...)` is hoisted before the loader's static import, so `readFileSync` can be wrapped in `vi.fn(actual.readFileSync)`. Filter `.mock.calls` by path ending with `system.md` to ignore tooling reads.
- `loadSystemPrompt()` cache survives across factory invocations; `_resetSystemPromptCache()` is the only way to force a re-read in tests.

## Files / Surfaces

- `packages/rag/src/application/createDialogusAgent.ts` (new)
- `packages/rag/src/index.ts` (modified — exports `createDialogusAgent` + types/constants)
- `packages/rag/__tests__/application/createDialogusAgent.test.ts` (new — 8 cases)

## Errors / Corrections

- (none)

## Ready for Next Run

- task_08 (`apps/mastra` scaffold) imports `createDialogusAgent`, `DIALOGUS_AGENT_ID`, `DIALOGUS_AGENT_NAME` from `@dialogus/rag`; Mastra instance must register `@mastra/pg` storage on the agent's `Memory` via the parent Mastra `storage` option.
- The factory's `Memory` instance is dependency-free at construction; the apps/mastra config layer provides `storage`. No changes needed in this package for that wiring.
- The tool ids registered on the agent are `semantic_search`, `list_chapters`, `get_chapter_summary`, `find_character_mentions` — apps/mastra and the integration suite (task_09) should expect those exact keys.
