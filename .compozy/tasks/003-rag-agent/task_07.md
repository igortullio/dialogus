---
status: completed
title: "createDialogusAgent factory + package barrel"
type: backend
complexity: medium
dependencies:
  - task_03
  - task_04
  - task_05
  - task_06
---

# Task 07: createDialogusAgent factory + package barrel

## Overview

Implement the `createDialogusAgent()` factory per TechSpec § Core Interfaces — composes the four tool factories (tasks 03–05), the system prompt (task 06), Mastra Memory configuration, and Anthropic model selection (`claude-haiku-4-5` dev / `claude-sonnet-4-6` prod) into a single `Agent` instance consumable by `apps/mastra`. Finalizes the `@dialogus/rag` barrel to export everything the wiring in task_08 needs.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/rag/src/application/createDialogusAgent.ts` exporting `createDialogusAgent(deps: AgentDeps): Agent` per the signature in TechSpec § Core Interfaces:
  - `AgentDeps`: `{ chunkRepo, chapterRepo, chapterSummaryRepo, queryEmbedder, logger, modelId: 'claude-haiku-4-5' | 'claude-sonnet-4-6' }`.
  - Factory composes all four tools via the factories from tasks 03, 04, 05; registers them in a name → tool map that Mastra accepts.
  - Loads system prompt via `loadSystemPrompt()` (task_06); attaches it with Anthropic prompt caching (`cache_control: { type: 'ephemeral' }` — 5-min TTL per TechSpec § Technical Considerations #14).
  - Instantiates the Anthropic model via `anthropic(modelId)` from `@ai-sdk/anthropic`.
  - Declares Mastra Memory configuration such that the agent consumes conversation state from the Mastra instance's `@mastra/pg` storage (wired in `apps/mastra/mastra.config.ts`, task_08). The factory returns an `Agent` without touching storage directly — storage is the apps/mastra concern; this factory only declares that memory is enabled.
  - Returns the Mastra `Agent` instance.
- MUST finalize `packages/rag/src/index.ts` barrel:
  - `createDialogusAgent` (this task).
  - All four tool factories (tasks 03, 04, 05) — named exports.
  - All three read-repository ports (task 01).
  - `QueryEmbedder` port (task 01) + both adapters (task 02).
  - `RagError` + subclasses (task 01).
  - `CITATION_MARKER_REGEX` (task 01).
  - `loadSystemPrompt` (task 06).
- MUST add a unit test asserting the factory composes the expected tool set and selects the correct Anthropic model per `modelId`.
- Factory MUST be pure — given the same deps and same inputs, it produces an equivalent `Agent` each call. No module-level state beyond what `loadSystemPrompt` caches.
- Error from `SummaryNotFoundError` (task 04) and `EmbeddingFailedError` (task 02) propagate up as Mastra tool errors; the factory does not wrap them.

</requirements>

## Subtasks

- [x] 7.1 Define `AgentDeps` interface + factory signature.
- [x] 7.2 Instantiate tools via the four factories.
- [x] 7.3 Wire Anthropic model selection + system prompt + memory hint.
- [x] 7.4 Finalize barrel `src/index.ts` with all public symbols.
- [x] 7.5 Unit tests with mocked deps.

## Implementation Details

Reference TechSpec § Core Interfaces for the factory signature (do not copy). Mastra 1.x's `Agent` constructor accepts `{ name, instructions, model, tools, memory }` — confirm at the pinned version before authoring; fall back to the documented shape if the API shifts minorly.

Prompt caching: `@ai-sdk/anthropic` exposes `cache_control` on content blocks; wrap the system prompt in a cached block. The 5-min TTL is Anthropic default ephemeral; matches the "active dogfooding" access pattern per TechSpec § Known Risks.

Memory configuration: Mastra Memory is owned by the Mastra instance (apps/mastra task_08) with `@mastra/pg` as the storage adapter per product ADR-006. The factory in this task only declares that the agent uses Memory; concrete storage config lives in `mastra.config.ts`.

### Relevant Files

- `packages/rag/src/application/tools/{semanticSearch,listChapters,getChapterSummary,findCharacterMentions}.ts` (tasks 03–05).
- `packages/rag/src/prompts/loader.ts` (task 06).
- `packages/rag/src/domain/ports/*.port.ts` (task 01).
- TechSpec § Core Interfaces — factory signature + dep list.
- Feature 002 `@dialogus/ingestion/src/infrastructure/persistence/Drizzle*Repository` — will satisfy the ports at apps/mastra wiring time (task_08).

### Dependent Files

- `packages/rag/src/application/createDialogusAgent.ts` (new)
- `packages/rag/src/index.ts` (modify: final barrel)
- `packages/rag/__tests__/application/createDialogusAgent.test.ts` (new)

### Related ADRs

- Product [ADR-005: Mastra Dev Server](../dialogus/adrs/adr-005.md) — factory targets Mastra runtime.
- Product [ADR-006: Mastra Memory](../dialogus/adrs/adr-006.md) — memory declared here, storage wired in task_08.
- [ADR-002: Language match](adrs/adr-002.md) — via system prompt.
- [ADR-003: Refusal](adrs/adr-003.md) — via system prompt.
- [ADR-007: Citation marker](adrs/adr-007.md) — via system prompt.

## Deliverables

- `createDialogusAgent.ts` factory.
- Final package barrel.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_09 (`agent-conversation.integration.test.ts` exercises the full factory output against MSW-mocked Anthropic).

## Tests

- Unit tests:
  - [x] Factory returns an `Agent` instance with exactly four tools registered (names: `semantic_search`, `list_chapters`, `get_chapter_summary`, `find_character_mentions`).
  - [x] `modelId: 'claude-haiku-4-5'` → agent's model configuration references the Haiku model id; same for Sonnet.
  - [x] Invalid `modelId` (not the union of two) → TypeScript compile error (structural; no runtime check needed since Zod-style validation is not required on a pure TS union).
  - [x] System prompt is attached — agent's instructions include the first 100 characters of `loadSystemPrompt()` output.
  - [x] Prompt caching is configured — the system-prompt content block carries `cache_control: { type: 'ephemeral' }` (asserted via inspection of the agent config object at the pinned Mastra version; fallback assertion if API surface changes).
  - [x] Two invocations of the factory with identical deps produce structurally-equivalent agents (idempotent factory).
  - [x] `loadSystemPrompt` called once on module init (by verifying a mocked `readFileSync` is called exactly once across two factory calls).
- Integration tests:
  - [ ] Deferred to task_09.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- `pnpm --filter @dialogus/rag typecheck` passes — no TypeScript errors.
- `pnpm --filter @dialogus/rag build` succeeds.
- Public barrel exports are stable — no renames expected after this task.
