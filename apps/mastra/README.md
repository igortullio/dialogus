# @dialogus/mastra

The Mastra Dev Server process that hosts `dialogusAgent` (Feature 003). Mastra
Memory is wired against `@mastra/pg` so threads, messages, tool calls, and tool
outputs persist in the same Postgres instance that holds `chunks`, `chapters`,
and `chapter_summaries` (read-only on the dIAlogus tables, per product ADR-006).

Mastra CLI 1.6.3 discovers `src/mastra/index.ts`; `mastra.config.ts` re-exports
the same instance for the boot smoke test.

## Purpose

`apps/mastra` is the runtime home of `dialogusAgent` — a Claude-backed RAG
agent composed by `@dialogus/rag`'s `createDialogusAgent` factory. It composes:

- the four read-only tools — `semantic_search`, `list_chapters`,
  `get_chapter_summary`, `find_character_mentions` — wired against Drizzle
  read adapters in `src/persistence/`;
- the committed system prompt at `packages/rag/src/prompts/system.md`
  (ADR-002 language match, ADR-003 refusal, ADR-007 citation marker);
- `@mastra/pg` `PostgresStore` for thread/message/tool-call persistence on the
  same `DATABASE_URL` as the rest of the workspace.

The Dev Server exposes Mastra's auto-generated routes at
`http://localhost:${MASTRA_PORT}` (e.g. `POST /api/agents/dialogusAgent/stream`,
`POST /api/memory/threads`); Mastra Studio runs alongside on
`http://localhost:${MASTRA_STUDIO_PORT}` for prompt tuning and observability.

## Boot

From the repo root, `pnpm dev` boots `apps/api`, `apps/worker`, `apps/web`, and
`apps/mastra` in parallel:

```sh
docker compose up -d   # postgres + pgvector + pg-boss schema
pnpm db:migrate        # apply Drizzle migrations 0000 → latest
pnpm dev               # api (3001) + mastra (3002) + worker + web (3000)
```

To run only the Mastra Dev Server (e.g. while iterating on the system prompt):

```sh
pnpm --filter @dialogus/mastra dev
```

The first boot triggers `@mastra/pg` to provision its `mastra_*` tables
inside the same database; subsequent boots reuse them.

## Env

`apps/mastra` shares the workspace `.env` (loaded via `loadEnvFromRoot`). The
Mastra-relevant keys, all already present in `.env.example`:

| Variable                  | Required when             | Default                      |
|---------------------------|---------------------------|------------------------------|
| `DATABASE_URL`            | always                    | `postgres://dialogus:dialogus@localhost:5432/dialogus` |
| `ANTHROPIC_API_KEY`       | running outside `NODE_ENV=test` | —                          |
| `OPENAI_API_KEY`          | running outside `NODE_ENV=test` | —                          |
| `MASTRA_PORT`             | always                    | `3002`                       |
| `MASTRA_STUDIO_PORT`      | always                    | `4111`                       |
| `NEXT_PUBLIC_MASTRA_URL`  | `apps/web` health probe   | `http://localhost:3002`      |
| `LOG_LEVEL`               | optional                  | `info`                       |

In `NODE_ENV=test` the embedding adapter swaps to `MockQueryEmbedder`
(deterministic SHA-256 vectors), so `OPENAI_API_KEY` is not required in CI;
the integration job pins fixture values regardless. See *Integration tests in
CI* below for the CI specifics.

## Mastra Studio

Studio is the primary lens during prompt tuning and ad-hoc validation. With
`pnpm dev` (or the filtered dev) running, open <http://localhost:4111>:

- **Threads** — every `POST /api/memory/threads` lands here; the cURL smoke
  scripts (below) create one thread per scenario so each appears as a row.
- **Per-turn tool calls** — selecting a thread message expands the
  `semantic_search` / `list_chapters` / `get_chapter_summary` /
  `find_character_mentions` invocations with their full input + output JSON.
  This is the fastest way to diagnose missing markers (the chunk_ids returned
  vs. the markers emitted) or spoiler-cap drift.
- **Token accounting + cache hits** — visible per turn; the system-prompt
  cache hit rate should hold once the 5-min TTL is warm (TechSpec § Integration
  Points).

Thread history is persisted in Postgres (`mastra_threads`, `mastra_messages`,
`mastra_tool_calls`, `mastra_tool_outputs`); a `pnpm db:reset` clears it.

## Smoke Scripts

Five bash scripts under `src/scripts/curl/` exercise the full path
catalog → ingestion → retrieval → grounded answer with `{{cite:<chunk_id>}}`
markers. Run them in order from the script directory after `pnpm dev` is up:

```sh
cd apps/mastra/src/scripts/curl
./01-add-books.sh       # adds Moby Dick (EN) + Dom Casmurro (PT) + Crime and Punishment (EN); waits for `ready`
./02-create-thread.sh   # Mastra thread scoped to Moby Dick
./03-ask-question.sh    # asserts ≥1 {{cite:<uuid>}} marker + chunk resolution (ADR-007)
./04-spoiler-cap.sh     # spoiler cap @ chapter 10; refusal OR ordinal-bounded citations
./05-empty-retrieval.sh # off-topic question; refusal + ≥2 reformulation hints (ADR-003)
```

Local deps: `bash`, `curl`, `jq` (`brew install jq` / `apt install jq`).

Captured payloads, SSE responses, and the resolved thread id land in
`src/scripts/curl/tmp/`, which is gitignored. Per-script contracts, environment
overrides, and failure-diagnosis tips live in
[`src/scripts/curl/README.md`](./src/scripts/curl/README.md).

## Integration Tests

```sh
pnpm --filter @dialogus/mastra test:integration
```

Or run the same matrix the CI job runs (api + mastra together):

```sh
pnpm test:integration
```

Skip the suites entirely (no Docker available) and the `describe.skipIf` guards
silently skip every test rather than failing.

### Integration tests in CI

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
