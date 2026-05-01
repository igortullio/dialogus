# dIAlogus V1 — Technical Specification

## Executive Summary

dIAlogus V1 is a monorepo of 4 apps (`api`, `web`, `worker`, `mastra`) and 5 packages (`shared`, `db`, `catalog`, `ingestion`, `rag`) running on Node 22 + TypeScript 6.0 with pnpm workspaces, inheriting m5nita's hexagonal DDD layout (`domain/application/infrastructure`, `.port.ts` interface naming, mapper pattern). The agent runtime is **Mastra Dev Server as a separate process** (port 3002), chosen for first-class Mastra Studio observability in exchange for a multi-process dev topology (api + mastra + worker + web + postgres). Conversation state lives in **Mastra Memory (@mastra/pg)** — threads, messages, and tool outputs (including citations) are Mastra-owned tables; dIAlogus owns the book, chapter, chunk, and embedding schemas via Drizzle. Integration tests use **Testcontainers** but run only in a dedicated CI job or on demand; pre-commit stays at lint + typecheck + unit tests.

Primary trade-off: **operational complexity in dev** (4 Node processes + Postgres simultaneously) bought for **architectural clarity plus Mastra-ecosystem idiom** (Studio, managed thread schema, clean boundary between AI layer and product layer). Fresh start from `dialogus-2`: nothing copied, reference only.

## System Architecture

### Component Overview

```
apps/web           Next.js 16 App Router, port 3000
  ├─ /             chat-first landing (sidebar = threads)
  ├─ /library      library management (UI label: "Gerenciar acervo")
  └─ Data: TanStack Query → apps/api ; Vercel AI SDK → apps/mastra

apps/api           Hono, port 3001
  ├─ /health
  ├─ /api/catalog/*      Gutendex search (LRU 60s)
  ├─ /api/library/*      book CRUD, ingest trigger, status, chunk lookup
  └─ Calls: Gutendex HTTPS, pg-boss.send(), @dialogus/db

apps/mastra        Mastra Dev Server, port 3002 (+ Studio 4111)
  ├─ /api/qa/threads, /api/qa/threads/:id/messages
  ├─ Agent: dialogusAgent (Sonnet prod, Haiku dev)
  ├─ Tools: semantic_search, list_chapters, get_chapter_summary, find_character_mentions
  └─ Memory: @mastra/pg on same Postgres

apps/worker        Node process
  └─ pg-boss.work('ingestion.*') — download → clean → parse → chunk → embed → index

packages/
  @dialogus/shared       Zod env schema, shared types, error classes
  @dialogus/db           Drizzle client, schemas, migrations, pg-boss init
  @dialogus/catalog      GutendexClient, BookRepository port, use cases
  @dialogus/ingestion    Stage handlers, EmbeddingProvider port, chunker
  @dialogus/rag          Mastra agent factory, tools, system prompt

external:
  gutendex.com · api.openai.com · api.anthropic.com
  Postgres 18 + pgvector (≥0.8.0) + pg-boss schema
```

**Data flow — ask a grounded question.** `apps/web` opens a thread via Vercel AI SDK `useChat` at `apps/mastra`. Mastra Agent receives message + spoiler cap (per-request param); calls `semantic_search` tool. Tool reads `chunks` via a repository in `@dialogus/rag`, filtered by `chapter_ordinal <= spoiler_cap`. Mastra persists thread/message/tool-output to `@mastra/pg`. Web renders stream; citation badges resolve excerpts by calling `GET /api/library/chunks/:id` on `apps/api`.

**Data flow — ingestion.** Web → POST `/api/library/books` → `apps/api` writes `books` (status=`discovered`). User clicks Ingerir → POST `/api/library/books/:id/ingest` → `apps/api` calls `pgboss.send('ingestion.download', { bookId })`. `apps/worker` processes the stage chain; each stage updates `books.ingestion_status`. Web polls `/api/library/books/:id/ingestion` every 2s.

## Implementation Design

### Core Interfaces

```typescript
// @dialogus/ingestion — swappable embeddings
export interface EmbeddingProvider {
  readonly dimensions: number
  embed(texts: string[]): Promise<number[][]>
}
```

```typescript
// @dialogus/ingestion — stage handler shape
export interface IngestionStage<Input, Output> {
  readonly name:
    | 'download' | 'clean' | 'parse' | 'chunk' | 'embed' | 'index'
  run(input: Input, ctx: StageContext): Promise<Output>
}

export interface StageContext {
  bookId: string
  logger: Logger
  db: Database
}
```

```typescript
// @dialogus/catalog — port for book persistence
export interface BookRepository {
  findById(id: string): Promise<Book | null>
  findByGutendexId(gutendexId: number): Promise<Book | null>
  save(book: Book): Promise<void>
  listAll(filter?: BookFilter): Promise<Book[]>
  softDelete(id: string): Promise<void>
}
```

```typescript
// @dialogus/rag — factory injects deps for testability
export function createDialogusAgent(deps: {
  db: Database
  chunkRepo: ChunkRepository
  chapterRepo: ChapterRepository
  model: LanguageModel
}): Agent
```

### Data Models

**Drizzle-owned (domain):**

| Table | Purpose | Key fields |
|---|---|---|
| `books` | library entity | id uuid, gutendex_id int unique, title, authors jsonb, languages text[], subjects text[], download_url_epub, download_url_txt, cover_url, raw_hash sha256, ingestion_status enum, ingestion_error text?, created_at, updated_at, deleted_at |
| `chapters` | parsed chapter | id, book_id fk, ordinal, title, plain_text, token_count |
| `chunks` | retrieval unit | id, book_id fk, chapter_id fk, ordinal, text, token_count, start_char, end_char, embedding `vector(1536)` |
| `pgboss.*` | job queue | managed by pg-boss |

**Mastra-owned (conversation):** `mastra_threads`, `mastra_messages`, `mastra_tool_calls`, `mastra_tool_outputs` — created and evolved by `@mastra/pg`. dIAlogus never migrates or queries these directly; access is via Mastra's API.

**Ingestion status enum** (from PRD; extended by feature 002 ADR-008 amendment):

```typescript
export const IngestionStatus = z.enum([
  'discovered', 'downloading', 'parsing',
  'chunking', 'summarizing', 'embedding',
  'ready', 'failed',
])
```

`'summarizing'` added for the seventh stage introduced in feature 002 ADR-008, driven by feature 003's grounded agent needing pre-generated chapter summaries.

**pgvector indexes:** HNSW on `chunks.embedding` with cosine distance; starting params `m=16, ef_construction=64` — revisit after 5 books ingested in Feature 002.

### API Endpoints

`apps/api` (Hono, port 3001):

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | DB ping + pg-boss liveness |
| GET | `/api/catalog/search` | Query Gutendex (cached 60s LRU) |
| GET | `/api/catalog/books/:gutendexId` | Gutendex single-book metadata |
| POST | `/api/library/books` | Add book by `gutendex_id` (status=discovered) |
| GET | `/api/library/books` | List library (language + status filters) |
| DELETE | `/api/library/books/:id` | Soft delete |
| POST | `/api/library/books/:id/ingest` | Enqueue ingestion |
| GET | `/api/library/books/:id/ingestion` | Current stage + error if any |
| POST | `/api/library/books/:id/ingest/retry` | Reset to `discovered`, re-enqueue |
| GET | `/api/library/chunks/:id` | Excerpt lookup for citation expansion |

`apps/mastra` (Mastra Dev Server, port 3002): routes auto-generated by Mastra for `dialogusAgent` (typically `/api/qa/threads` + `/api/qa/threads/:id/messages` as SSE). Web uses `useChat({ api: <mastra-url> })`.

Zod validation on every request/response shape. Schemas exported from `@dialogus/shared/schemas` for reuse by `apps/web`.

## Integration Points

| Service | Purpose | Auth | Error + retry |
|---|---|---|---|
| Gutendex (`https://gutendex.com`) | Book metadata + download URLs | None (public) | 2× exponential retry; 60s LRU on search; raw files cached locally after first download (SHA-256 keyed) |
| OpenAI Embeddings | `text-embedding-3-small` (1536d) | `OPENAI_API_KEY` | Batch 100 texts/call; `@ai-sdk/openai` retry; abstracted behind `EmbeddingProvider` |
| Anthropic Claude (`@ai-sdk/anthropic`) | Agent LLM | `ANTHROPIC_API_KEY` | `claude-haiku-4-5` dev, `claude-sonnet-4-6` prod; prompt caching on system prompt; Mastra handles retry/backoff |
| Postgres 18 + pgvector (≥0.8.0) | Data + vectors + job queue | `DATABASE_URL` | pg-boss owns its retries; Drizzle errors bubble to HTTP as `HTTPException` |

## Impact Analysis

Greenfield — every component is new. Risk profile per item:

| Component | Impact | Description / risk | Action |
|---|---|---|---|
| `apps/api` | new | Hono server, routing, Zod validation — medium risk | Build in Step 1 Foundation |
| `apps/web` | new | Next 16 + Tailwind v4 + assistant-ui — medium risk (learning curve) | Build last (Step 7), 2-3 weeks |
| `apps/worker` | new | pg-boss consumer — low risk when handlers are pure | Step 5 alongside `@dialogus/ingestion` |
| `apps/mastra` | new | Mastra Dev Server + `@mastra/pg` memory — medium risk (version drift) | Step 6 alongside `@dialogus/rag` |
| `@dialogus/shared` | new | Env + types + errors — low risk | Step 2 |
| `@dialogus/db` | new | Drizzle + pgvector + pg-boss init — medium risk | Step 3 |
| `@dialogus/catalog` | new | Gutendex client + library CRUD — low-medium risk | Step 4 (Feature 001) |
| `@dialogus/ingestion` | new | Pipeline + EN+PT heuristics — high risk | Step 5 (Feature 002) |
| `@dialogus/rag` | new | Mastra agent factory — medium risk | Step 6 (Feature 003) |

## Testing Approach

### Unit Tests

- **Runner**: Vitest 4; default config unless a package needs an override.
- **Layout**: each package has `__tests__/` mirroring `src/` (m5nita convention).
- **Mocks**: MSW 2 for Gutendex + OpenAI HTTP; fixtures in `__fixtures__/`. `MockEmbeddingProvider` returning deterministic unit vectors. In-memory repositories for use-case tests in `@dialogus/catalog`.
- **Critical scenarios**: chapter detection for EN + PT fixtures (3 per language); chunker boundary conditions (paragraph > window, single-paragraph book, empty book); cleaner strips PG START/END markers; agent factory composes tools with injected deps.
- **Pre-commit runs**: lint (Biome) + typecheck (`tsc --noEmit`) + unit tests with mocks. **Integration tests are excluded from pre-commit.**

### Integration Tests

- **Runner**: Vitest 4 with `vitest.integration.config.ts`; files match `*.integration.test.ts`.
- **DB**: Testcontainers spins a fresh Postgres 18 + pgvector per suite.
- **When**: dedicated CI job after lint/typecheck; on demand locally via `pnpm test:integration`. **Never** in pre-commit.
- **Coverage**: migrations clean-boot, catalog HTTP→repo→DB path, full ingestion pipeline on a smallest fixture book, agent conversation with MSW-mocked Anthropic (citations reference real chunk IDs).
- **E2E (Playwright)**: one happy-path scenario (search → ingest → ask → citation → spoiler) in Feature 004.

## Development Sequencing

### Build Order

1. **Foundation scaffold** (no deps)
   - `pnpm init`, `pnpm-workspace.yaml`, root `tsconfig.json`, `biome.json`, `.githooks/pre-commit`.
   - `docker-compose.yml` with Postgres 18 + pgvector (≥0.8.0) + uuid-ossp.
   - `apps/api` Hono skeleton with `/health`. `apps/web` Next 16 App Router skeleton with placeholder `/`.
   - CI `ci.yml` with 3 jobs mirroring m5nita (lint-and-typecheck, test, build).

2. **`@dialogus/shared`** — depends on 1
   - Zod env schema + `loadConfig()` with startup validation.
   - Shared error classes (`DialogusError`, `NotFoundError`, `ValidationError`).
   - Shared Zod schemas re-exportable to web + api.

3. **`@dialogus/db`** — depends on 2
   - Drizzle client + postgres.js driver singleton.
   - First migration: `pgvector` + `uuid-ossp` extensions, `system_health` canary, pg-boss init.
   - Root scripts: `db:generate`, `db:migrate`, `db:reset`, `db:seed`, `db:studio`.

4. **`@dialogus/catalog`** — depends on 2, 3
   - GutendexClient (fetch + Zod, LRU 60s, MSW-tested).
   - `books` schema + `BookRepository` port + `DrizzleBookRepository` + mapper.
   - Use cases: `searchGutendex`, `addBookToLibrary`, `listLibrary`, `removeBook`.
   - Hono routes in `apps/api/src/infrastructure/http/routes/{catalog,library}.ts`.

5. **`@dialogus/ingestion` + `apps/worker`** — depends on 2, 3, 4
   - `chapters`, `chunks` schemas + repositories.
   - Stage handlers (download / clean / parse / chunk / embed / index) as `IngestionStage<I, O>` pure functions.
   - EN + PT chapter heuristics in a language-keyed registry (regex + fallback).
   - `EmbeddingProvider` port + `OpenAIEmbeddingProvider` + `MockEmbeddingProvider`.
   - `apps/worker` bootstraps pg-boss, registers handlers.
   - API: `POST /ingest`, `GET /ingestion`, `POST /ingest/retry`.

6. **`@dialogus/rag` + `apps/mastra`** — depends on 3, 5
   - `createDialogusAgent({ db, chunkRepo, chapterRepo, model })`.
   - Tools: `semantic_search`, `list_chapters`, `get_chapter_summary`, `find_character_mentions`.
   - System prompt as a Markdown asset; citation + spoiler reinforcement.
   - `apps/mastra/mastra.config.ts` wires `@mastra/pg` memory against the same Postgres DSN; `apps/mastra/index.ts` boots Mastra Dev Server.
   - Integration test: full conversation with MSW-mocked Anthropic, asserting citations map to real chunk IDs.

7. **`apps/web` chat-first UI** — depends on 4, 6
   - App Router: `/`, `/library` (UI label continues to read "Gerenciar acervo").
   - Sidebar thread list + empty-state "Primeiros passos" card (3 recommended books).
   - Thread composer with book picker + spoiler slider; header indicator for active cap.
   - `assistant-ui` primitives (`<Thread>`, `<Composer>`) + custom `<CitationBadge>` + `<SpoilerSlider>`.
   - Vercel AI SDK `useChat` wired to `apps/mastra`.
   - TanStack Query for library state; Tailwind v4 + shadcn.

8. **Polish + dogfooding launch** — depends on 7
   - CI green on all jobs.
   - A11y audit + onboarding copy in Portuguese.
   - Ingest 5+ books (≥ 3 EN, ≥ 2 PT).
   - Record 3-min screencast; update README + ARCHITECTURE.md.

### Technical Dependencies

- **Docker Desktop** running locally for `docker-compose up` + Testcontainers.
- **API keys**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (`.env.example` shipped; `.env` gitignored).
- **Node 22.13+** via `.nvmrc`; **pnpm 9.15+** via Corepack.
- **TypeScript 6.0** baseline; fallback to `~5.9` only if a peer dep (Mastra / Drizzle / AI-SDK) rejects TS 6 — reevaluate during Step 6.

## Monitoring and Observability

- **Structured logging**: `pino` + `pino-pretty` dev, JSON prod. Ingestion log fields: `trace_id, book_id, stage, duration_ms, input_size, output_size`. RAG fields: `thread_id, tool_name, top_k`.
- **Agent observability**: Mastra Studio at `:4111` — thread history, tool invocations, tokens. Dev-only but essential for prompt tuning.
- **Queue depth**: `/health` reports pg-boss counts per stage.
- **No external APM in V1**. Phase 2 optional (Sentry + OpenTelemetry) if dogfooding reveals gaps.
- **Owner-tracked metrics** (subjective): ingestion success rate per book, first-token latency (already in Studio), citation-verify rate during dogfooding self-audit.

## Technical Considerations

### Key Decisions

1. **Mastra Dev Server as a separate process** (ADR-005) — Studio observability + idiomatic runtime; trade 4 Node processes in dev for clean boundaries. `pnpm dev` uses `pnpm --parallel -r dev`.
2. **Mastra Memory owns conversation schema** (ADR-006) — less code, Studio sees threads natively. Spoiler cap cannot live there; passed per-request as tool param; UI persists user preference (local storage first; a thin `thread_book_preferences` table in `@dialogus/db` optional — resolved in Chat UI TechSpec).
3. **Testcontainers, CI-only** (ADR-007) — clean isolation, zero local setup beyond Docker. Pre-commit stays fast (lint + typecheck + unit).
4. **Fresh start from dialogus-2** (ADR-008) — prevents inheriting latent bugs; algorithm choices (600-token chunks, ~100 overlap) inherited as defaults, not code.
5. **Hexagonal DDD from m5nita** — `.port.ts` interfaces, concrete implementation names (`DrizzleBookRepository`, not `*Impl`), mapper classes for domain↔persistence. Clean test boundaries via port injection.
6. **Env validation in `@dialogus/shared`** — `loadConfig()` at each app entry; throws grouped error on missing/malformed vars. Centralized + typed vs. m5nita's direct-`process.env` style.
7. **Chunking defaults** — 600-token window, 100-token overlap, paragraph-aligned — revisit in Feature 002 TechSpec after ingesting 2-3 books.
8. **URLs in English, UI strings in Portuguese** — `/library` route, "Gerenciar acervo" label. Common i18n split; keeps code + URLs stable across locales.

### Known Risks

- **Postgres 18 adoption** — recent major (2025-09). Confirm `@mastra/pg`, `pg-boss 12`, and `pgvector ≥ 0.8.0` all apply cleanly on PG 18 during Foundation Step 1. Fallback to PG 17 if any blocker surfaces; nothing in the design depends on PG 18-specific features.
- **TypeScript 6 peer compat** — TS 6 is newer than several Mastra/Drizzle/AI-SDK peer pins may expect. If any peer refuses TS 6, pin root `typescript@~5.9` and revisit at Step 6.
- **EPUB parsing in PT** — Gutenberg's PT corpus uses different metadata conventions than EN; parser may silently drop chapters. Mitigation: Feature 002 TechSpec mandates "parse 3 reference PT books" acceptance check (*Dom Casmurro*, *O Primo Basílio*, Pessoa anthology).
- **Mastra peer versioning** — still pre-1.0 (or recent 1.x); breaking minors possible. Mitigation: pin exact versions; review changelog before upgrade.
- **pgvector HNSW tuning** — defaults may underperform on small corpora. Mitigation: tuning step in Feature 002 TechSpec after first 5 books.
- **Multi-process dev fragility** — 4 Node procs + Postgres must all be healthy; crash cascades. Mitigation: root `pnpm dev` uses `concurrently` (or `turbo run dev`) with colored logs; failed process does not kill siblings.

## Architecture Decision Records

- [ADR-001: Chat-first product shape](adrs/adr-001.md) — Landing is chat with thread list, not library grid.
- [ADR-002: Scholarly grounded agent posture](adrs/adr-002.md) — Neutral academic tone with cited passages; no persona, no roleplay.
- [ADR-003: Full 5-feature MVP with lighter guardrails](adrs/adr-003.md) — Follow old plan's sequence; shrink Constitution and test harness weight.
- [ADR-004: Spoiler boundary as the V1 differentiator](adrs/adr-004.md) — Only one UX innovation in V1; multi-translation and structure-aware chunking deferred.
- [ADR-005: Mastra Dev Server as a separate process](adrs/adr-005.md) — 4 Node processes in dev in exchange for Mastra Studio and idiomatic Mastra runtime.
- [ADR-006: Mastra Memory owns conversation persistence](adrs/adr-006.md) — `@mastra/pg` tables for threads/messages; spoiler cap passed per-request.
- [ADR-007: Testcontainers for integration tests, CI-only](adrs/adr-007.md) — Integration tests excluded from pre-commit; ephemeral Postgres per suite in CI.
- [ADR-008: Fresh start from dialogus-2](adrs/adr-008.md) — No code copied; previous project is scope / algorithm reference only.
