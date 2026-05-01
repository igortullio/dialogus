# Feature 003: RAG Agent — Technical Specification

## Executive Summary

Feature 003 introduces `@dialogus/rag` (agent factory + 4 tools + system prompt asset + 3 read-only domain ports) and `apps/mastra` (Mastra Dev Server process hosting the `dialogusAgent` on port 3002 with Studio on 4111). Agent state — threads, messages, tool calls, tool outputs — lives entirely in Mastra Memory via `@mastra/pg` (product ADR-006); dIAlogus code is strictly read-only against `chunks`, `chapters`, and the new `chapter_summaries` table. Citations flow from tool output into prose via the `{{cite:<chunk_id>}}` inline marker (feature ADR-007); Chat UI (Feature 004) owns the marker-to-badge rendering.

A prerequisite of this feature is a retroactive amendment to Feature 002 (feature ADR-001): a new `chapter_summaries` table plus a `summarize` pipeline stage between `chunk` and `embed`. Feature 003 cannot ship until that amendment lands because `get_chapter_summary` has no data to read otherwise.

Primary trade-off: **accept a `@dialogus/rag` → `@dialogus/ingestion` dep edge that visually inverts reading expectation** (feature ADR-006) for **zero Drizzle adapter duplication and zero retroactive migration of repository code between packages**. The alternative — moving adapters to `@dialogus/db` or duplicating them in `apps/mastra` — was rejected as either a bigger retroactive churn or daily-cost duplication.

## System Architecture

### Component Overview

```
apps/web                                  (unchanged in 003 — Feature 004 owns chat UI)

apps/api                                  (unchanged — GET /api/library/chunks/:id from 002 is the citation resolver)

apps/mastra                               (NEW — Mastra Dev Server, port 3002 + Studio 4111)
  src/index.ts                            boot: loadConfig → Mastra instance → serve
  src/mastra.config.ts                    Mastra factory: storage + agents + memory
  src/wiring.ts                           imports Drizzle adapters from @dialogus/ingestion, builds dep object
  src/scripts/curl/                       portfolio-grade cURL smoke scripts (shipped alongside code)
    01-add-books.sh
    02-create-thread.sh
    03-ask-question.sh
    04-spoiler-cap.sh
    05-empty-retrieval.sh
    README.md

packages/
  @dialogus/rag                           (NEW)
    src/domain/
      ports/
        ChunkReadRepository.port.ts       semantic + mentions + findById
        ChapterReadRepository.port.ts     listByBook + findById
        ChapterSummaryReadRepository.port.ts   findByChapterId
      entities/
        ChunkWithContext.ts               read model (chunk + chapter metadata)
        ChapterView.ts                    read model (id, ordinal, title, tokenCount)
        ChapterSummaryView.ts             read model
      errors/
        RagError.ts                       SummaryNotFoundError, EmbeddingFailedError
    src/application/
      tools/
        semanticSearch.ts                 creates Mastra tool with Zod input/output schemas
        listChapters.ts                   ditto
        getChapterSummary.ts              ditto
        findCharacterMentions.ts          ditto
      createDialogusAgent.ts              agent factory (deps injected)
    src/infrastructure/
      embedding/
        OpenAIQueryEmbedder.ts            embeds the user's query for semantic_search
        MockQueryEmbedder.ts              deterministic for tests
      ports/
        QueryEmbedder.port.ts             embed(text: string): Promise<number[]>
    src/prompts/
      system.md                           committed Markdown asset
      system.test.ts                      snapshot test (max tokens, required sections)
    src/index.ts                          barrel (createDialogusAgent + ports + errors)

  @dialogus/ingestion                     (amendments — driven by feature ADR-001)
    src/domain/chapter_summary/
      ChapterSummary.ts                   entity
      ChapterSummaryRepository.port.ts    write-side port (readByChapterId + upsert)
      ChapterSummaryGenerator.port.ts     LLM generator port
    src/infrastructure/persistence/
      DrizzleChapterSummaryRepository.ts  new adapter
      mappers/ChapterSummaryMapper.ts
    src/infrastructure/external/
      AnthropicChapterSummaryGenerator.ts new adapter (Haiku-based)
      MockChapterSummaryGenerator.ts      test double
    src/application/stages/
      summarize.ts                        NEW stage: between chunk and embed
    src/infrastructure/persistence/
      DrizzleChunkRepository.ts           (existing — gains structural satisfaction of ChunkReadRepository)
      DrizzleChapterRepository.ts         (existing — gains structural satisfaction of ChapterReadRepository)

  @dialogus/db                            (amendment)
    src/schema/chapter_summaries.ts       NEW Drizzle table
    drizzle/0004_chapter_summaries.sql    generated, no hand-editing

  @dialogus/shared                        (unchanged)
    (agent request/response Zod schemas are Mastra-native; no new @dialogus/shared/schemas)

external:
  api.anthropic.com     via @ai-sdk/anthropic — agent LLM + summary generation LLM
  api.openai.com        via @ai-sdk/openai    — query embedding (reuses OpenAIEmbeddingProvider shape)
  Postgres 18 + pgvector + @mastra/pg       — chunks + chapters + chapter_summaries + mastra_* tables
```

**Data flow — ask a grounded question (multi-book thread, spoiler cap active):**

1. `useChat` in Chat UI (Feature 004 future) posts `{ message, book_ids, spoiler_caps, thread_id }` to `apps/mastra` SSE endpoint. During 003, the cURL smoke scripts post directly.
2. Mastra routes the payload to `dialogusAgent.stream()`. Mastra Memory loads thread history from `mastra_*` tables (prompt cache hit).
3. Agent runs its reasoning loop: first tool call is always `semantic_search` with `{ query, book_ids, spoiler_caps, k }`.
4. `semantic_search` tool:
   - `QueryEmbedder` calls OpenAI `text-embedding-3-small` on the user query → 1536-dim vector.
   - `ChunkReadRepository.searchSemantic({ bookIds, queryEmbedding, spoilerCaps, k })` runs one SQL query with `WHERE book_id = ANY($1) AND (chapter_ordinal <= caps[book_id] OR caps IS NULL for that book) ORDER BY embedding <=> $2 LIMIT $3`.
   - Tool returns `{ chunks: [...] }` with full context (book_id, chapter_id, chapter_ordinal, chapter_title, text, score, excerpt_preview).
5. Agent composes a response interleaving prose with `{{cite:<chunk_id>}}` markers per claim (feature ADR-007).
6. Response streams via SSE. Mastra Memory writes `mastra_messages` + `mastra_tool_calls` + `mastra_tool_outputs` rows.
7. Client (or cURL script) captures the SSE stream; UI (Feature 004) resolves badges via `GET /api/library/chunks/:id`.

**Data flow — ask for a chapter summary:**

1. User message: "resumo do capítulo 5 de Crime and Punishment".
2. Agent detects language (PT) → will respond in PT (feature ADR-002).
3. Agent calls `list_chapters({ book_id })` → returns chapter metadata; finds the chapter whose `ordinal = 5`.
4. Agent calls `get_chapter_summary({ chapter_id })`.
5. `ChapterSummaryReadRepository.findByChapterId(id)` returns `{ summary, book_id, chapter_id, chapter_ordinal, chapter_title, token_count, model, generated_at }`.
6. If `null` (should never happen on a `ready` book — partial failures keep the book in `summarizing`/`failed`, see feature ADR-005), tool returns a structured error; agent relays a refusal in the user's language + suggests re-ingestion. In normal ops, agent returns the summary with a single chapter-level citation.

**Data flow — empty retrieval:**

1. `semantic_search` returns `chunks: []`.
2. Agent calls `list_chapters` to seed reformulation hints.
3. Agent emits a refusal message in the user's language (feature ADR-003) + 2–3 hints.
4. No `{{cite:...}}` markers (there's nothing to cite); UI renders the prose as-is.

## Implementation Design

### Core Interfaces

```typescript
// @dialogus/rag/domain/ports/ChunkReadRepository.port.ts
export interface ChunkReadRepository {
  searchSemantic(params: {
    readonly bookIds: string[]
    readonly queryEmbedding: number[]
    readonly spoilerCaps?: Record<string, number>
    readonly k: number
  }): Promise<ChunkWithContext[]>
  findById(id: string): Promise<ChunkWithContext | null>
  findCharacterMentions(params: {
    readonly bookIds: string[]
    readonly aliases: string[]
    readonly spoilerCaps?: Record<string, number>
    readonly limit: number
  }): Promise<ChunkWithContext[]>
}
```

```typescript
// @dialogus/rag/domain/entities/ChunkWithContext.ts
export interface ChunkWithContext {
  readonly chunkId: string
  readonly bookId: string
  readonly chapterId: string
  readonly chapterOrdinal: number
  readonly chapterTitle: string
  readonly text: string
  readonly excerptPreview: string
  readonly score: number
}
```

```typescript
// @dialogus/rag/domain/ports/QueryEmbedder.port.ts
export interface QueryEmbedder {
  readonly dimensions: 1536
  readonly modelName: string
  embed(query: string): Promise<number[]>
}
```

```typescript
// @dialogus/rag/application/createDialogusAgent.ts
import { Agent } from '@mastra/core'
import { anthropic } from '@ai-sdk/anthropic'

export interface AgentDeps {
  readonly chunkRepo: ChunkReadRepository
  readonly chapterRepo: ChapterReadRepository
  readonly chapterSummaryRepo: ChapterSummaryReadRepository
  readonly queryEmbedder: QueryEmbedder
  readonly logger: Logger
  readonly modelId: 'claude-haiku-4-5' | 'claude-sonnet-4-6'
}

export function createDialogusAgent(deps: AgentDeps): Agent
```

```typescript
// @dialogus/rag/application/tools/semanticSearch.ts — Zod-typed Mastra tool
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const semanticSearchTool = (deps: AgentDeps) => createTool({
  id: 'semantic_search',
  description: 'Retrieve passages semantically similar to the query from selected books.',
  inputSchema: z.object({
    query: z.string().min(1),
    book_ids: z.array(z.string().uuid()).min(1),
    spoiler_caps: z.record(z.string().uuid(), z.number().int().min(0)).optional(),
    k: z.number().int().min(1).max(30).default(10),
  }),
  outputSchema: z.object({ chunks: z.array(chunkWithContextSchema) }),
  execute: async ({ context: input }) => { /* embed → repo → map */ },
})
```

### Data Models

**Drizzle-owned (new — shipped in 002 amendment, depended on by 003):**

| Table | Columns |
|---|---|
| `chapter_summaries` | `id uuid pk default uuid_generate_v4()`, `chapter_id uuid fk → chapters(id) on delete cascade unique`, `book_id uuid fk → books(id) on delete cascade`, `summary text not null`, `token_count int not null`, `model text not null`, `generated_at timestamptz not null default now()` |

**Indexes:**
- `chapter_summaries(chapter_id)` — unique (from column constraint); primary access path for `get_chapter_summary` tool.
- `chapter_summaries(book_id)` — for book-scoped sweeps (re-summarization, deletion cleanup).

**Optional `books.ingestion_status` enum value (Feature 002 amendment decision):** add `'summarizing'` between `'chunking'` and `'embedding'` to make the new stage visible, OR leave the enum alone and report the stage under `chunking`. 003 TechSpec prefers adding the enum value for UI fidelity; final call made in the 002 amendment TechSpec.

**Mastra-owned (unchanged from product ADR-006):** `mastra_threads`, `mastra_messages`, `mastra_tool_calls`, `mastra_tool_outputs` — owned and migrated by `@mastra/pg`.

### API Endpoints

`apps/mastra` (Mastra Dev Server, port 3002) — routes auto-generated by Mastra for `dialogusAgent`:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/agents/dialogusAgent/stream` | Chat with the agent; SSE response with tool calls + tokens (Mastra 1.x convention) |
| GET | `/api/memory/threads/:id` | Thread history (Mastra-native; used by Studio) |
| GET | `/api/memory/threads/:id/messages` | Messages within a thread |

Exact path prefixes depend on Mastra's runtime conventions at the pinned version; the feature TechSpec does not lock the paths because Mastra's client SDK (`@mastra/client-js`) + Vercel AI SDK `useChat` abstract them. The cURL smoke scripts encode the paths actually used by the pinned Mastra version.

No new routes added to `apps/api`. The `GET /api/library/chunks/:id` route ships in Feature 002 and is the authoritative excerpt resolver for UI citation badges.

**Tool input/output Zod schemas** live inside `@dialogus/rag/src/application/tools/*.ts` (co-located with each tool). They are not exported to `@dialogus/shared` because they are Mastra-internal contracts; `apps/web` does not call these tools directly.

### Citation marker contract (ADR-007)

- **Format**: `{{cite:<chunk_id>}}` where `<chunk_id>` is a UUID v4.
- **Parse regex**: `/\{\{cite:([0-9a-f-]{36})\}\}/g` — documented here for Feature 004 implementation.
- **Resolution**: Chat UI matches marker IDs against the current thread's `tool_outputs[*].chunks[*].chunk_id`; unknown IDs render a warning icon. Full excerpt resolved via `GET /api/library/chunks/:id`.
- **System-prompt instruction**: see `@dialogus/rag/src/prompts/system.md` section "Citações".

## Integration Points

| Service | Purpose | Auth | Retry / error |
|---|---|---|---|
| Anthropic (`@ai-sdk/anthropic`) | Agent LLM — `claude-haiku-4-5` (dev), `claude-sonnet-4-6` (prod) | `ANTHROPIC_API_KEY` | Mastra + `@ai-sdk/anthropic` built-in retry; explicit 429 backoff; prompt caching on system prompt (5-min TTL for V1; 1-hour evaluated in Phase 2) |
| OpenAI (`@ai-sdk/openai`) | Query embedding — `text-embedding-3-small` (1536d) | `OPENAI_API_KEY` | `@ai-sdk/openai` built-in retry; single-query calls (no batching needed for live queries); per-request cost logged |
| Postgres 18 + pgvector (HNSW cosine) | `chunks`, `chapters`, `chapter_summaries` reads + Mastra Memory writes | `DATABASE_URL` | Drizzle errors bubble as `RagError` subclasses; `@mastra/pg` handles its own write retries |
| Mastra Memory (`@mastra/pg`) | Thread/message/tool-output persistence | Same `DATABASE_URL` | Managed by Mastra; pinning the Mastra version ensures schema stability |

## Impact Analysis

| Component | Impact | Description / Risk | Required Action |
|---|---|---|---|
| `@dialogus/rag` | new | First agent package; 3 ports + 4 tools + factory + system prompt asset. Medium risk (first Mastra integration) | Steps 3–6 of Build Order |
| `apps/mastra` | new | First Mastra Dev Server process; cross-process wiring with Drizzle adapters. Medium risk (Mastra version churn) | Step 7 |
| `@dialogus/db` `chapter_summaries` | new | One new Drizzle table + migration. Low risk | Prerequisite via 002 amendment |
| `@dialogus/ingestion` `chapter_summaries` | modified | New port + adapter + summarize stage; Anthropic key becomes ingestion dep. Medium risk (retroactive; LLM calls inside pipeline) | Prerequisite via 002 amendment |
| `apps/api` | unchanged | `GET /chunks/:id` from 002 serves agent citation badges | None |
| `apps/web` | unchanged | Feature 004 owns chat UI; 003 does not touch it | None |
| CI `integration` job | extended | New Mastra-agent integration suite with MSW-mocked Anthropic + Testcontainers | Step 8 |
| `.env.example` | modified | `MASTRA_PORT=3002`, `MASTRA_STUDIO_PORT=4111`, `NEXT_PUBLIC_MASTRA_URL=http://localhost:3002` | Step 7 |
| Root `pnpm dev` | modified | Orchestration adds `apps/mastra` to the parallel set (api + mastra + worker + web) | Step 7 |

## Testing Approach

### Unit Tests

- **Tools** (`semanticSearch.test.ts`, `listChapters.test.ts`, `getChapterSummary.test.ts`, `findCharacterMentions.test.ts`): inject mock repositories + mock `QueryEmbedder`; assert input-schema rejection, orchestration, output shape, empty-result behavior, spoiler-cap propagation.
- **`createDialogusAgent` factory**: assert tool set, memory config, model id selection by env; no real LLM calls.
- **System prompt asset** (`system.test.ts`): snapshot-style — asserts (a) token count ≤ 2000 via `js-tiktoken`, (b) required sections present (identity, grounding, citation, refusal, language-match, spoiler), (c) no TODO markers.
- **`QueryEmbedder`** (`OpenAIQueryEmbedder.test.ts`): MSW-mocked OpenAI; 200 path, 429 retry path, dimension assertion.
- **Citation marker regex** (`citation-marker.test.ts`): pure regex tests for parser (even though the parser lives in Feature 004, the regex constant ships from `@dialogus/rag` for Feature 004 to import).

Target: ≥ 80 % coverage on `@dialogus/rag` (excluding the prompt asset).

### Integration Tests

- **`summaries-read.integration.test.ts`** — applies migrations via Testcontainers, seeds 1 book + 3 chapters + 3 summaries, asserts `ChapterSummaryReadRepository.findByChapterId` returns correct data and `null` for unknown id.
- **`semantic-search.integration.test.ts`** — seeds 1 book + 5 chapters + 15 chunks with real embeddings from `MockEmbeddingProvider` (deterministic unit vectors); asserts HNSW query returns expected top-k with and without spoiler cap; cross-book query against 2 books asserts global-top-k mixing.
- **`agent-conversation.integration.test.ts`** — full Mastra agent conversation with MSW-mocked Anthropic (fixture responses emitting `{{cite:...}}` markers against real chunk IDs); asserts citation marker regex matches, tool_output chunk_ids match marker IDs, refusal path fires when semantic_search returns empty.
- **`spoiler-cap.integration.test.ts`** — 5-chapter book, cap at ordinal 2, query that would otherwise retrieve chapter 4 chunks; asserts retrieval returns only chapter ≤ 2 chunks; assertion at tool level (not agent level) because the filter is SQL.
- **`find-character-mentions.integration.test.ts`** — seeds chunks with/without "Ishmael" substring; asserts case-insensitive + diacritics-insensitive matching; asserts earliest-chapter ordering.

Per-suite container boot target < 15s; whole 003 integration suite wall-clock < 3 min. Integration job in `ci.yml` grows by these 5 files; pre-commit stays unchanged (product ADR-007).

### E2E Tests

Not in 003. Feature 004 adds one Playwright happy-path.

### Manual Smoke (before closing Feature 003)

Executed via `apps/mastra/src/scripts/curl/*.sh`:

1. `docker compose up -d && pnpm db:migrate && pnpm dev` → api + mastra + worker + web all green.
2. `./01-add-books.sh` — adds 3 books (Moby Dick EN, Dom Casmurro PT, Crime and Punishment EN) through Feature 001/002 endpoints; waits for each to reach `ready` (including summaries, via 002 amendment).
3. `./02-create-thread.sh` — creates a thread scoped to Moby Dick; captures `thread_id` into env.
4. `./03-ask-question.sh` — sends "where does Ishmael first meet Queequeg?" to `apps/mastra` stream endpoint; captures SSE; asserts response contains ≥ 1 `{{cite:...}}` marker with a chunk_id that exists in the book.
5. `./04-spoiler-cap.sh` — creates a new thread with spoiler cap = chapter 10 on Moby Dick; asks "how does Ahab die?"; asserts response is a refusal (no content-related citation) OR a claim citing only chapters ≤ 10.
6. `./05-empty-retrieval.sh` — creates a thread on Dom Casmurro; asks a deliberately off-topic question about gnomes; asserts response contains no `{{cite:...}}` marker and contains a reformulation block (lines starting with "-").
7. System prompt validation — owner runs ≥ 10 self-posed questions (mix of EN/PT, 3 books, 1 with spoiler cap); manual log of citation resolvability + spoiler compliance per feature 003 PRD exit criteria. Mastra Studio at `http://localhost:4111` is the inspection surface; no UI harness in `apps/web` (feature 004 owns that).
8. CI green on all jobs including integration.

## Development Sequencing

### Build Order

**Prerequisite: Feature 002 amendment must ship first.** The amendment adds `chapter_summaries` table + schema to `@dialogus/db`, `DrizzleChapterSummaryRepository` + `AnthropicChapterSummaryGenerator` + `summarize` stage to `@dialogus/ingestion`, and re-validates integration smoke. Estimated 4–6 new tasks appended to Feature 002. Until that amendment is merged, `@dialogus/rag` has no data to read for `get_chapter_summary`.

1. **`@dialogus/rag` domain layer** — depends on 002 amendment
   - `src/domain/ports/{ChunkReadRepository,ChapterReadRepository,ChapterSummaryReadRepository,QueryEmbedder}.port.ts`.
   - `src/domain/entities/{ChunkWithContext,ChapterView,ChapterSummaryView}.ts`.
   - `src/domain/errors/RagError.ts` — `SummaryNotFoundError`, `EmbeddingFailedError`.
   - Barrel exports ports + entities + errors (but not implementations yet).

2. **`@dialogus/rag` infrastructure — embedding adapter** — depends on 1
   - `src/infrastructure/embedding/OpenAIQueryEmbedder.ts` via `@ai-sdk/openai`.
   - `src/infrastructure/embedding/MockQueryEmbedder.ts` for tests.
   - Unit tests with MSW.

3. **`@dialogus/rag` application layer — tool factories** — depends on 1, 2
   - `src/application/tools/semanticSearch.ts` — inputs: query, book_ids, spoiler_caps, k. Calls `QueryEmbedder` + `ChunkReadRepository.searchSemantic`.
   - `src/application/tools/listChapters.ts` — inputs: book_id. Calls `ChapterReadRepository.listByBook`.
   - `src/application/tools/getChapterSummary.ts` — inputs: chapter_id. Calls `ChapterSummaryReadRepository.findByChapterId`; throws `SummaryNotFoundError` if null.
   - `src/application/tools/findCharacterMentions.ts` — inputs: book_ids, aliases (array), optional spoiler_caps, limit. Calls `ChunkReadRepository.findCharacterMentions`.
   - Each tool exports a factory `(deps) => createTool({...})` matching Mastra's API at the pinned version.
   - Unit tests with in-memory port mocks.

4. **`@dialogus/rag` system prompt asset** — depends on 1
   - `src/prompts/system.md` — authored Markdown covering: identity (scholarly posture), grounding contract, citation format (`{{cite:<chunk_id>}}`), refusal + reformulation, language-match, spoiler-cap reinforcement.
   - `src/prompts/system.test.ts` — token count ≤ 2000; required headings present; no TODOs.
   - `src/prompts/loader.ts` — `loadSystemPrompt(): string` (reads file at import time; caches).

5. **`@dialogus/rag` agent factory** — depends on 3, 4
   - `src/application/createDialogusAgent.ts` — composes all 4 tools + system prompt + `@mastra/memory` config + Anthropic model selection per `modelId` dep.
   - Unit tests: asserts tool set complete, model id mapping, prompt caching enabled.

6. **`@dialogus/rag` barrel + package wiring** — depends on 5
   - `src/index.ts` — exports `createDialogusAgent`, all ports, `RagError` subclasses, citation-marker regex constant.
   - `package.json` deps: `@mastra/core`, `@mastra/memory`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@dialogus/ingestion` (workspace), `zod`, `js-tiktoken`.

7. **`apps/mastra` scaffold + wiring** — depends on 6
   - `src/index.ts` — `loadConfig()` → `createDatabase(DATABASE_URL)` → instantiate `OpenAIQueryEmbedder` + all three Drizzle adapters imported from `@dialogus/ingestion` → pass to `createDialogusAgent()` → construct `Mastra` with `@mastra/pg` storage + agents map → `mastra dev` boots Studio + Dev Server.
   - `src/mastra.config.ts` — Mastra factory per Mastra 1.x convention.
   - `package.json`: `"type": "module"`, scripts `dev` (`mastra dev`), `start` (`mastra start`), `build`; deps on `@mastra/core`, `@mastra/pg`, `@dialogus/rag`, `@dialogus/ingestion` (for adapter imports), `@dialogus/shared`.
   - `.env.example` updated: `MASTRA_PORT=3002`, `MASTRA_STUDIO_PORT=4111`, `NEXT_PUBLIC_MASTRA_URL=http://localhost:3002`.
   - Root `pnpm dev` orchestration includes `apps/mastra` in the parallel set.
   - Smoke boot: `pnpm --filter @dialogus/mastra dev` produces a working Studio at `:4111`.

8. **Integration tests** — depends on 7
   - 5 `*.integration.test.ts` files per the Testing Approach section.
   - `integration` CI job extended to pick them up; wall-clock budget enforced.

9. **cURL smoke scripts + README** — depends on 7
   - `apps/mastra/src/scripts/curl/*.sh` — 5 scripts per Manual Smoke section.
   - `apps/mastra/src/scripts/curl/README.md` documents the sequence and acceptance criteria.

10. **System-prompt validation** — depends on 7, 9
    - Owner runs ≥ 10 questions (mix of EN/PT, 3 books, ≥ 1 with spoiler cap) via Mastra Studio.
    - Captures: citation-resolvability rate, spoiler compliance, refusal appropriateness, language-match accuracy.
    - Records results in `apps/mastra/src/scripts/curl/validation-log.md` (gitignored template; actual log lives locally).
    - PRD Exit Criteria annotated with pass/fail per metric.

11. **Feature closure** — depends on 8, 10
    - CI green on all jobs including new integration suite.
    - `chore(repo): close feature 003-rag-agent` commit.
    - README architecture section updated to reflect `apps/mastra` + `@dialogus/rag`.

### Technical Dependencies

- **Prerequisite (external to 003 task graph):** Feature 002 amendment merged. Without it, `chapter_summaries` table and `DrizzleChapterSummaryRepository` do not exist.
- **Runtime deps (`@dialogus/rag`)**: `@mastra/core`, `@mastra/memory`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `zod`, `js-tiktoken`, `@dialogus/ingestion` (workspace).
- **Runtime deps (`apps/mastra`)**: `@mastra/core`, `@mastra/pg`, `@dialogus/rag`, `@dialogus/ingestion`, `@dialogus/shared`, `pino`.
- **Dev deps**: `msw` (already in place for 002), Testcontainers (in place from 001/002), Vitest 4 (root).
- **Env**: `ANTHROPIC_API_KEY` (already reserved in `.env.example`), `OPENAI_API_KEY` (same), `MASTRA_PORT=3002`, `MASTRA_STUDIO_PORT=4111`, `NEXT_PUBLIC_MASTRA_URL=http://localhost:3002`.
- **Pin exact versions** of `@mastra/*` per product TechSpec Known Risks; upgrades are deliberate.

## Monitoring and Observability

- **Structured logs** (pino via `@dialogus/shared/logger`) from tools:
  - `semantic_search`: `{ event: 'tool_call', tool: 'semantic_search', thread_id, book_ids, spoiler_caps_active, k, returned_count, duration_ms }`
  - `get_chapter_summary`: `{ event: 'tool_call', tool: 'get_chapter_summary', thread_id, chapter_id, hit: boolean, duration_ms }`
  - `find_character_mentions`: `{ event: 'tool_call', tool: 'find_character_mentions', thread_id, book_ids, alias_count, returned_count, duration_ms }`
  - `list_chapters`: `{ event: 'tool_call', tool: 'list_chapters', thread_id, book_id, chapter_count, duration_ms }`
- **Agent-level log events**: `{ event: 'agent_turn', thread_id, message_id, tool_calls_count, input_tokens, output_tokens, cache_hit, duration_ms }`.
- **Refusal events**: `{ event: 'refusal', thread_id, reason: 'empty_retrieval' | 'spoiler_cap' | 'summary_missing', book_ids }` — surfaces the agent abstaining.
- **Mastra Studio** (`:4111` dev-only) is the primary lens for prompt tuning: thread history, per-turn tool calls, token accounting, prompt-cache hit/miss.
- **No external APM** in V1 (product ADR scope).

## Technical Considerations

### Key Decisions

1. **Mastra Dev Server as a separate process** (product ADR-005) — `apps/mastra` is its own Node process; 4 Node processes in dev (api + mastra + worker + web).
2. **Mastra Memory owns conversation persistence** (product ADR-006) — `@mastra/pg` tables; dIAlogus read-only on `chunks`/`chapters`/`chapter_summaries`.
3. **`@dialogus/rag` → `@dialogus/ingestion` dep direction** (feature ADR-006) — zero adapter duplication; package graph acquires a conceptually-backwards edge.
4. **`chapter_summaries` dedicated table** (feature ADR-005) — 1:1 with chapters; clean lifecycle separation from `chapters.plain_text`.
5. **Citation marker `{{cite:<chunk_id>}}`** (feature ADR-007) — parse regex documented; chunk UUID is authoritative.
6. **Global top-k for multi-book semantic_search** — single `WHERE book_id = ANY(...)` query; HNSW + cosine decide the ordering. If dogfooding reveals a book consistently starving, Phase 2 adds per-book quota behind the same tool contract (tool signature already carries book_ids so a future quota param is additive).
7. **Smoke tests via cURL, not apps/web** — Feature 003 does not touch `apps/web`. Owner's 10-question validation runs through Mastra Studio's playground + cURL scripts. Feature 004 adds the real UI.
8. **Language-matching via single system-prompt instruction** (feature ADR-002) — no language-detection library; defer to Claude 4.x.
9. **Refusal + reformulation hints in system prompt** (feature ADR-003) — no second retrieval pass; zero-result refusal threshold.
10. **No reranking in V1** (feature ADR-004) — pure HNSW; tool shape carries `score` for future rerank slot-in.
11. **System prompt as Markdown asset, not TypeScript constant** — committed file; snapshot-tested for size + required sections; easy to iterate without rebuilds.
12. **Query embedding is a one-shot call per user question** — `OpenAIQueryEmbedder.embed(query)` every turn. No caching in V1 (cache keys on string hash is a Phase 2 optimization; per-query cost of `text-embedding-3-small` is negligible at dogfood volume).
13. **Thread creation via first message** — Mastra 1.x convention: client posts a message with an optional `thread_id`; if absent, Mastra creates and returns one. No dedicated "create thread" endpoint.
14. **Prompt caching with 5-minute TTL** — Anthropic default; matches active-development pattern. 1-hour TTL is a Phase 2 optimization after dogfood usage reveals access patterns.

### Known Risks

- **Mastra 1.x pre-stability churn** — 1.0 shipped January 2026; minor versions may break. Mitigation: pin exact `@mastra/*` versions; upgrade deliberately with changelog review (product TechSpec already calls this out).
- **System-prompt regression has no CI guard** — a prompt edit that degrades answer quality won't fail any test. Mitigation: ≥ 10-question validation round before closure; Phase 2 adds Ragas-style evals with curated dataset.
- **Summary generation LLM cost during long-book ingestion** — *War and Peace* has ~365 chapters × Haiku summary = measurable cost. Mitigation: summary generation runs once per chapter; no re-billing on re-ingestion; owner-monitored during dogfood. Mitigation lives in Feature 002 amendment (summary prompt design).
- **Empty-retrieval threshold is zero-result only** — a weakly-relevant chunk (similarity 0.2) will drive an answer attempt that could hallucinate. Mitigation: dogfood-data-driven; if hallucinations from weak chunks surface, TechSpec-level threshold tuning adds a `score_floor` to `semantic_search` (additive to the tool contract).
- **Prompt cache TTL of 5 minutes** — if the owner pauses > 5 min between messages in a thread, every resume pays full system-prompt cost. Mitigation: measurable via Mastra Studio; Phase 2 switch to 1-hour TTL if pattern hurts.
- **Dep edge `@dialogus/rag` → `@dialogus/ingestion`** inflates install time marginally and surfaces ingestion's transitive deps (e.g., `@gxl/epub-parser`) in `rag`'s `node_modules`. Mitigation: cost is bounded; Phase 2 refactor path documented in feature ADR-006.
- **Multi-book thread HNSW starvation** — with global top-k, a book with stylistically distant content from the query gets pushed below `k`. Mitigation: add per-book quota behind `semantic_search` in Phase 2 if observed; feature ADR-004 notes the slot-in.
- **`find_character_mentions` alias-list provenance** — V1 relies on the user (or the agent inferring from context) to pass aliases. A PT-EN alias list for "carpinteiro"/"carpenter" must be stated by the agent (via system prompt instruction) or the tool call misses cross-language matches. Mitigation: system prompt includes a note instructing the agent to derive aliases from the question's language + the book's languages.

## Architecture Decision Records

- [ADR-001: Feature 003 is agent-only; chapter-summary generation moves into Feature 002](adrs/adr-001.md) — Scope decision; 002 owns summary generation, 003 consumes.
- [ADR-002: Agent responds in the user's message language](adrs/adr-002.md) — Auto-detect per turn; quotes retain source language.
- [ADR-003: Refusal with reformulation hints on empty retrieval](adrs/adr-003.md) — Abstain + 2–3 grounded hints; no silent retry.
- [ADR-004: No reranking in V1; pure HNSW semantic retrieval](adrs/adr-004.md) — Defer to Phase 2; tool shape accommodates future slot-in.
- [ADR-005: Chapter summaries live in a dedicated `chapter_summaries` table](adrs/adr-005.md) — 1:1 with chapters; lifecycle separation from `plain_text`.
- [ADR-006: `@dialogus/rag` depends on `@dialogus/ingestion` and reuses its Drizzle repositories](adrs/adr-006.md) — Zero adapter duplication; conceptually-backwards dep edge accepted.
- [ADR-007: Inline citation markers use `{{cite:<chunk_id>}}` double-brace syntax](adrs/adr-007.md) — Parse-robust, collision-safe, LLM-friendly; regex documented for Feature 004.
