# @dialogus/mastra

The Mastra Dev Server process that hosts `dialogusAgent` (Feature 003). Mastra
Memory is wired against `@mastra/pg` so threads, messages, tool calls, and tool
outputs persist in the same Postgres instance that holds `chunks`, `chapters`,
and `chapter_summaries` (read-only on the dIAlogus tables, per product ADR-006).

Mastra CLI 1.6.3 discovers `src/mastra/index.ts`; `mastra.config.ts` re-exports
the same instance for the boot smoke test.

## Integration tests in CI

The `integration` job in `.github/workflows/ci.yml` runs the workspace
`pnpm test:integration` script, which delegates via `pnpm -r --filter` to both
`@dialogus/api` and `@dialogus/mastra`. Vitest's `**/*.integration.test.ts`
include pattern (see `apps/mastra/vitest.integration.config.ts`) picks up every
suite under `apps/mastra/__tests__/integration/` automatically.

The five suites shipped by Feature 003 task_09:

| Suite | Surface under test |
|---|---|
| `summaries-read.integration.test.ts` | `DialogusChapterSummaryReadAdapter` against seeded summaries |
| `semantic-search.integration.test.ts` | `semanticSearchTool` end-to-end with HNSW + `MockQueryEmbedder` |
| `agent-conversation.integration.test.ts` | Full Mastra agent loop with MSW-mocked Anthropic emitting `{{cite:<chunk_id>}}` markers |
| `spoiler-cap.integration.test.ts` | `semantic_search` SQL `spoiler_caps` filter |
| `find-character-mentions.integration.test.ts` | Diacritics-insensitive ILIKE + earliest-chapter ordering |

All five spin a `pgvector/pgvector:pg18` Testcontainer in `beforeAll` and apply
the Drizzle migrations from `packages/db/drizzle/`. MSW intercepts every
Anthropic call and `MockQueryEmbedder` short-circuits OpenAI, so no live
external service is reached.

The integration job pins fixture API keys (`ANTHROPIC_API_KEY=test-anthropic-key`,
`OPENAI_API_KEY=test-openai-key`) so any boot-time config validation that probes
for presence is satisfied without exposing real secrets — these MUST stay as
fixture strings. The 15-minute job timeout comfortably absorbs the observed
wall-clock (≈ 7 s for the mastra suites, ≈ 34 s for the api suites locally; CI
adds the `pnpm install` warmup and Docker pull).

## Run integration tests locally

Docker Desktop must be running so Testcontainers can boot Postgres:

```sh
pnpm --filter @dialogus/mastra test:integration
```

Or run the same matrix the CI job runs (api + mastra together):

```sh
pnpm test:integration
```

Skip the suites entirely (no Docker available) and the `describe.skipIf` guards
silently skip every test rather than failing.
