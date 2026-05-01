# Task Memory: task_09.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Five integration suites under `apps/mastra/__tests__/integration/` (summaries-read, semantic-search, agent-conversation, spoiler-cap, find-character-mentions) + shared `_helpers/seed.ts`, all green against pgvector:pg18 Testcontainers + MSW Anthropic. Per-suite + total wall clock budgets (<30s / <3min) met (mastra 5 files / 10 tests / ~7s).

## Important Decisions

- **Inlined HNSW + ILIKE/unaccent SQL inside `apps/mastra/src/persistence/DialogusChunkReadAdapter`** instead of retrofitting Feature 002 `DrizzleChunkRepository` write-side. Adapter is `@dialogus/mastra`-local read-side, parameterizes embedding via `[v1,v2,...]::vector` literal, joins `chapters` for ordinal/title, uses `unaccent(text) ILIKE unaccent('%alias%')` for diacritics-insensitive mentions. ADR-006 spirit preserved (no Drizzle in `@dialogus/rag`); Feature 002 amendment unblocked without churn.
- **Migration `0007_enable_unaccent.sql`** is just `CREATE EXTENSION IF NOT EXISTS unaccent;`. Sits next to the existing `_journal.json` entry ordinal 7. Required by `findCharacterMentions` SQL above.
- **`agent-conversation` test wraps the Mastra agent in a `Mastra({ storage: PostgresStore, agents })` instance** because `createDialogusAgent` ships with `new Memory()` storageless — Mastra injects storage at registration time. Storage lifecycle hoisted to `beforeAll` / `afterAll` (cached `AgentRuntime { agent, storage }`); `storage.close()` runs before `stopPostgres(pg)` to avoid post-suite Postgres `57P01` admin-shutdown errors leaking into vitest with `dangerouslyIgnoreUnhandledErrors: false`.
- **Tool_result extraction** factored into `extractToolResultPayload<T>(body)` + `readBlockText(content)` helpers to keep the two MSW handlers under Biome's cognitive complexity 15 cap (was 37).
- **Root `test:integration` script** now also filters `@dialogus/mastra`. The `__tests__/integration-harness.test.ts` regex/`describe.each` was generalized to assert `--filter=@dialogus/api` AND `--filter=@dialogus/mastra` (any order) and to walk both `apps/api` + `apps/mastra` package + Vitest configs.

## Learnings

- `mastra.getAgent(id)` in `@mastra/core@1.28.0` returns `Promise<Agent>` (resolves dynamic registration) — must `await` before `agent.generate()`.
- Each Testcontainer pgvector boot adds ~2s wall; vitest `pool: 'forks'` runs all 5 mastra suites in parallel forks, so wall-clock total stays ~7s rather than 5×~10s.
- MSW handler at `https://api.anthropic.com/v1/messages` returning a `tool_use`-then-`end_turn` pair is sufficient to drive Mastra's tool-loop end-to-end with Anthropic SDK v1 message shape: `type: 'message'`, `role: 'assistant'`, `content: [{ type: 'tool_use', name, input }] | [{ type: 'text', text }]`, `stop_reason: 'tool_use' | 'end_turn'`, `usage: { input_tokens, output_tokens }`.

## Files / Surfaces

- new: `apps/mastra/__tests__/integration/{_helpers/seed.ts, summaries-read, semantic-search, agent-conversation, spoiler-cap, find-character-mentions}.integration.test.ts`
- new: `apps/mastra/vitest.integration.config.ts`
- new: `packages/db/drizzle/0007_enable_unaccent.sql` + `meta/0007_snapshot.json` + `_journal.json` entry idx 7
- modified: `apps/mastra/src/persistence/DialogusChunkReadAdapter.ts` (stubs replaced with real SQL)
- modified: `apps/mastra/__tests__/persistence/DialogusChunkReadAdapter.test.ts` (assert real behaviour, not "throws Feature 002 amendment")
- modified: `apps/mastra/package.json` (`test:integration` script + `@testcontainers/postgresql` + `msw` devDeps)
- modified: `package.json` (root `test:integration` filters `@dialogus/mastra`)
- modified: `__tests__/integration-harness.test.ts` (generalized to multiple workspaces)

## Errors / Corrections

- Initial `agent-conversation` runs failed with "Memory requires a storage provider" — fixed by wrapping the agent in a Mastra instance + PostgresStore (see decisions).
- Subsequent passing run leaked Postgres connection errors during teardown (FATAL 57P01) — fixed by hoisting storage to suite-level + closing it in `afterAll` before container shutdown.
- Biome cognitive-complexity errors on the two MSW handlers — fixed by extracting `extractToolResultPayload` + `readBlockText` helpers.
- Three unused imports (`Mastra`, `Agent`, `PostgresStore`) flagged by tsc until the agent-runtime refactor pulled them back into use.

## Ready for Next Run

- `task_10` (CI integration job extension) should pick up the existing `pnpm test:integration` root script — it now spans both `@dialogus/api` and `@dialogus/mastra` filters; CI just needs Docker. No additional plumbing required.
- Per-suite duration ceiling and total budget already enforced by Vitest's `testTimeout: 180_000` / `hookTimeout: 240_000` in `apps/mastra/vitest.integration.config.ts`; observed wall-clock ~7s across all 5 mastra suites.
