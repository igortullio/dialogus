# Workflow Memory

Keep only durable, cross-task context here. Do not duplicate facts that are obvious from the repository, PRD documents, or git history.

## Current State

- Tasks 01–12 complete. task_13 (feature closure) in progress.
- All 4 PRD metrics PASS (validation-log.md committed in task_12). `_prd.md` "Exit Criteria Verification" section already written.

## Shared Decisions

- **Mastra runtime pins:** `@mastra/core@1.28.0`, `@mastra/memory@1.17.1` in `packages/rag`; `@mastra/pg@1.9.2`, `mastra@1.6.3` in `apps/mastra`.
- **Storage class is `PostgresStore`** (`{ id, connectionString }`; `id: 'dialogus-mastra-pg'`). Injected at `Mastra({ storage, agents })` — not on factory.
- **Mastra CLI 1.6.3 discovers `src/mastra/index.ts`**, not `mastra.config.ts`.
- **Tool output keys are snake_case** (`chunk_id`, `excerpt_preview`, etc.).
- **Mastra HTTP routes:** `POST /api/agents/:agentId/stream { messages, threadId, resourceId }` for chat; `POST /api/memory/threads { resourceId }` for thread creation.

## Shared Learnings

- **`createTool` execute signature (1.28.0):** `(inputData, context)`. `context.agent?.threadId` is thread-id path.
- **Zod peer mismatch (benign):** `@mastra/core@1.28.0` pulls `zod@^3`; workspace pins `zod@^4`. Accepted via Standard Schema bridge.

## Open Risks

(none)
