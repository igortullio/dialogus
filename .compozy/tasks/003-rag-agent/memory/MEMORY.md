# Workflow Memory

Keep only durable, cross-task context here. Do not duplicate facts that are obvious from the repository, PRD documents, or git history.

## Current State

- Tasks 01–12 complete: `@dialogus/rag` domain, all four agent tools, system prompt, `createDialogusAgent()` factory, `apps/mastra` scaffold, integration tests, CI extension, 5 cURL smoke scripts + READMEs, system prompt validation (all 4 PRD metrics PASS, 0 prompt iterations).
- task_13 (feature closure) is pending.

## Shared Decisions

- **Mastra runtime pins:** `@mastra/core@1.28.0`, `@mastra/memory@1.17.1` in `packages/rag`; `@mastra/pg@1.9.2`, `mastra@1.6.3` in `apps/mastra`.
- **Storage class is `PostgresStore`** (NOT `PgStorage`). Constructor `{ id, connectionString }`; `id: 'dialogus-mastra-pg'`.
- **Mastra CLI 1.6.3 discovers `src/mastra/index.ts`** — NOT `mastra.config.ts`.
- **Tool output keys are snake_case** (`chunk_id`, `excerpt_preview`, etc.).
- **Mastra storage injected at `Mastra({ storage, agents })`** — not on factory. `createDialogusAgent` ships `new Memory()` storageless.

## Shared Learnings

- **Mastra `createTool` execute signature (1.28.0):** `(inputData, context)`. `context.agent?.threadId` is thread-id path. Apply runtime fallbacks — `InferPublicSchema` flattens `.default()` oddly.
- **Zod peer mismatch (benign):** `@mastra/core@1.28.0` pulls `zod@^3`; workspace pins `zod@^4`. Accepted via Standard Schema bridge.

## Open Risks

(none — task_12 validation passed; `apps/api` wiring was resolved before the smoke run)

## Handoffs

- **task_13 (feature closure)**: All 4 PRD metrics green (validation-log.md committed). CI must be green on all jobs. Write `apps/mastra/README.md` + update root architecture section. Close with `chore(repo): close feature 003-rag-agent`.
- **Mastra 1.28 HTTP routes**: `POST /api/agents/:agentId/stream { messages, threadId, resourceId }` for chat; `POST /api/memory/threads { resourceId }` for thread creation.
