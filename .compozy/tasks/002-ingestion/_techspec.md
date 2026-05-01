# Feature 002: Book Ingestion — Technical Specification

## Executive Summary

Ingestion introduces the first dedicated background process (`apps/worker`) as the sole pg-boss worker for the project, a new domain package (`@dialogus/ingestion`) with hexagonal DDD, two new tables (`chapters` + `chunks` with `vector(1536)` HNSW indexing), and a six-stage pg-boss pipeline (download → clean → parse → chunk → embed → index) orchestrated per ADR-001. Four new HTTP endpoints extend the catalog's `/api/library/*` namespace. The pipeline is serial (ADR-002), resumable from any failed stage via SHA-256 + DB-state checkpoints (ADR-003), and streaming-first across every stage (ADR-004).

Primary trade-off: **upfront discipline on streaming + idempotency + port-based abstractions** in exchange for **a pipeline that handles any Gutenberg book size, recovers cleanly from any stage failure, and costs nothing to test**. The alternative — batch-everything-in-memory with coarse retry — was rejected across three feature ADRs because Gutenberg politeness, OpenAI cost, and book-size variance make it untenable in practice.

One retroactive change to Feature 001: the catalog cleanup job (`catalog.cleanup-idempotency-keys`) migrates from `apps/api` to `apps/worker` (ADR-005). `apps/api` becomes purely request-handling; `apps/worker` is the sole long-running pg-boss consumer.

**Amendment (ADR-008, 2026-04-24):** Feature 003 (RAG Agent) requires pre-generated chapter summaries. A seventh stage (`summarize`) is inserted between `chunk` and `embed`, producing one `chapter_summaries` row per chapter via Claude Haiku. Pipeline becomes **download → clean → parse → chunk → summarize → embed → index**. The `books.ingestion_status` enum gains `'summarizing'`. `ANTHROPIC_API_KEY` becomes an ingestion runtime dep. See ADR-008 for rationale + trade-offs.

## System Architecture

### Component Overview

```
apps/web                                  (modified)
  src/lib/library.ts                      fetchLibraryCount() → { total, ready }
  src/app/page.tsx                        renders "livros: X (prontos: N)"

apps/api                                  (extended — 4 new routes, cleanup job removed)
  src/infrastructure/http/routes/library.ts
    ├── POST /api/library/books/:id/ingest              enqueues ingestion.download
    ├── GET  /api/library/books/:id/ingestion           reads books.ingestion_* state
    ├── POST /api/library/books/:id/ingest/retry        resumes from failed stage
    └── GET  /api/library/chunks/:id                    excerpt lookup

apps/worker                               (NEW — sole pg-boss worker)
  src/index.ts                            boot: createPgBoss → start → register all handlers → schedule cron jobs
  src/handlers/ingestion-download.ts      stage 1
  src/handlers/ingestion-clean.ts         stage 2
  src/handlers/ingestion-parse.ts         stage 3
  src/handlers/ingestion-chunk.ts         stage 4
  src/handlers/ingestion-summarize.ts     stage 5 (NEW — ADR-008)
  src/handlers/ingestion-embed.ts         stage 6 (renumbered)
  src/handlers/ingestion-index.ts         stage 7 (renumbered)
  src/handlers/catalog-cleanup-idempotency-keys.ts   migrated from apps/api (ADR-005)

packages/
  @dialogus/ingestion                     (new)
    src/domain/ingestion/
      IngestionStatus.ts                  enum re-exported
      IngestionError.ts                   DownloadError, CleanError, ParseError, ChunkError, EmbedError, IndexError
    src/domain/chapter/
      Chapter.ts                          entity
      ChapterRepository.port.ts           port
    src/domain/chunk/
      Chunk.ts                            entity
      ChunkRepository.port.ts             port
    src/domain/chapter_summary/           (NEW — ADR-008)
      ChapterSummary.ts                   entity
      ChapterSummaryRepository.port.ts    port (write-side + narrow findByChapterId)
      ChapterSummaryGenerator.port.ts     LLM-agnostic generator port
    src/domain/embedding/
      EmbeddingProvider.port.ts           port
    src/domain/parser/
      ChapterParser.port.ts               port
    src/application/stages/
      download.ts                         use case — Gutendex fetch, cache, SHA-256
      clean.ts                            use case — strip boilerplate
      parse.ts                            use case — chapter extraction (streaming)
      chunk.ts                            use case — paragraph-aligned token pack (streaming)
      summarize.ts                        use case — generate chapter summaries via LLM (NEW — ADR-008)
      embed.ts                            use case — batch-of-100 via EmbeddingProvider (streaming)
      index.ts                            use case — ANALYZE + mark ready
    src/infrastructure/persistence/
      DrizzleChapterRepository.ts
      DrizzleChunkRepository.ts
      DrizzleChapterSummaryRepository.ts  (NEW — ADR-008)
      mappers/{ChapterMapper,ChunkMapper,ChapterSummaryMapper}.ts
    src/infrastructure/external/
      GutendexDownloader.ts               polite download adapter (rate-limited + User-Agent + mirror)
      OpenAIEmbeddingProvider.ts          @ai-sdk/openai-based
      MockEmbeddingProvider.ts            deterministic hash-based
      AnthropicChapterSummaryGenerator.ts Haiku-based; bottleneck rate-limited (NEW — ADR-008)
      MockChapterSummaryGenerator.ts      deterministic for tests (NEW — ADR-008)
    src/infrastructure/prompts/
      summarize.md                        chapter-summary prompt (NEW — ADR-008)
    src/infrastructure/parsing/
      EpubChapterParser.ts                @gxl/epub-parser
      EpubChapterParserEpub2.ts           epub2 fallback (ChapterParser port)
      TxtChapterParser.ts                 regex-based, loads heuristics YAML
      GutenbergCleaner.ts                 boilerplate stripper
      chapter-heuristics.yaml             EN + PT regex patterns (Zod-validated at boot)
    src/index.ts                          barrel (stages + ports only; adapters internal)

  @dialogus/shared                        (extended — 1 new slug added to problem catalog)
    src/schemas/ingestion.ts              IngestionStatus, IngestionProgress, ChunkReadResponse schemas

  @dialogus/db                            (extended — 2 tables + migration 0003; +1 table + migration 0004 via ADR-008)
    src/schema/chapters.ts                new table
    src/schema/chunks.ts                  new table with vector(1536) column
    src/schema/chapter_summaries.ts       new table (NEW — ADR-008)
    drizzle/0003_chapters_chunks.sql      generated + hand-edited to add HNSW index
    drizzle/0004_chapter_summaries.sql    generated (NEW — ADR-008)
```

**Data flow — full ingestion, happy path:**

1. Client `POST /api/library/books/<uuid>/ingest` with `Idempotency-Key`.
2. `apps/api` library route handler verifies book is in `discovered` state (else 409 `book-not-in-discovered-state`), idempotency middleware (from Feature 001) checks the key.
3. Route enqueues via a transient pg-boss instance: `await boss.send('ingestion.download', { bookId })`. Returns 202 with `{ job_id }`.
4. `apps/worker` (long-running) has `boss.work('ingestion.download', handler)` registered; picks the job. Handler:
   - Updates `books.ingestion_status = 'downloading'`, `ingestion_progress = 0`.
   - Checks `./storage/raw/<gutendex_id>.<ext>` + `books.raw_hash`; if present & hash matches, skip to enqueue `ingestion.clean`.
   - Otherwise calls `GutendexDownloader.download(gutendex_id, format)` which does polite fetch (User-Agent, 1-2s jitter, `aleph.gutenberg.org` mirror); streams response body to disk; computes SHA-256; updates `books.raw_hash`.
   - On success: `boss.send('ingestion.clean', { bookId })`. Updates `ingestion_status = 'cleaning'`.
5. Similarly through stages 2-6. Each handler updates `books.ingestion_status` + `ingestion_progress`.
6. After `ingestion.index`: `books.ingestion_status = 'ready'`, `books.indexed_at = now()`.
7. Client polling `GET /ingestion` sees progress increase every few seconds.
8. Catalog `apps/web` landing polls `GET /api/library/books?status=ready` and updates "prontos: N".

**Data flow — resume after embed failure:**

1. OpenAI 503 during embed stage of book 7. Handler catches, updates `books.ingestion_status = 'failed'`, `ingestion_error = 'OpenAI 503 upstream timeout'`.
2. Owner `POST /api/library/books/<uuid>/ingest/retry`. Route handler:
   - Reads `books.ingestion_status`; if `'failed'`, enqueues `ingestion.<last_attempted_stage>` (recorded in `books.ingestion_last_stage`).
3. `ingestion.embed` handler re-runs: queries `chunks WHERE book_id = $1 AND embedding IS NULL`; processes only missing batches. Previously-embedded chunks are skipped.
4. Book reaches `ready` without re-download / re-parse / re-chunk / re-billing successful embeddings.

## Implementation Design

### Core Interfaces

```typescript
// @dialogus/ingestion/domain/embedding/EmbeddingProvider.port.ts
export interface EmbeddingProvider {
  readonly dimensions: 1536
  readonly modelName: string
  embed(texts: string[]): Promise<number[][]>
}
```

```typescript
// @dialogus/ingestion/domain/parser/ChapterParser.port.ts
export interface ChapterParser {
  parse(rawFilePath: string, language: 'en' | 'pt'): AsyncIterable<ParsedChapter>
}
export interface ParsedChapter {
  readonly ordinal: number
  readonly title: string
  readonly plainText: string
  readonly tokenCount: number
}
```

```typescript
// @dialogus/ingestion/application/stages/*.ts — all stages share this shape
export interface StagePayload {
  readonly bookId: string
}
export interface StageDeps {
  readonly db: Database
  readonly logger: Logger
  readonly chapterRepo: ChapterRepository
  readonly chunkRepo: ChunkRepository
  readonly embeddingProvider: EmbeddingProvider
  readonly chapterParser: ChapterParser
  readonly downloader: GutendexDownloader
  readonly pgboss: PgBoss
}
export type StageHandler = (payload: StagePayload, deps: StageDeps) => Promise<void>
```

```typescript
// @dialogus/ingestion/infrastructure/parsing/TxtChapterParser.ts — YAML-driven heuristics
export interface ChapterHeuristicsConfig {
  en: { patterns: RegExp[]; fallbackTitle: string }
  pt: { patterns: RegExp[]; fallbackTitle: string }
}
// Loaded at boot via yaml + zod:
// chapterHeuristicsSchema.parse(yaml.parse(readFileSync('chapter-heuristics.yaml', 'utf8')))
```

### Data Models

**Drizzle-owned (new):**

| Table | Columns |
|---|---|
| `chapters` | `id uuid pk default uuid_generate_v4()`, `book_id uuid fk -> books(id) on delete cascade`, `ordinal int not null`, `title text not null`, `plain_text text not null`, `token_count int not null`, `created_at timestamptz default now()`, unique `(book_id, ordinal)` |
| `chunks` | `id uuid pk default uuid_generate_v4()`, `book_id uuid fk -> books(id) on delete cascade`, `chapter_id uuid fk -> chapters(id) on delete cascade`, `ordinal int not null`, `text text not null`, `token_count int not null`, `start_char int not null`, `end_char int not null`, `embedding vector(1536)`, `created_at timestamptz default now()`, unique `(book_id, chapter_id, ordinal)` |
| `chapter_summaries` (NEW — ADR-008) | `id uuid pk default uuid_generate_v4()`, `chapter_id uuid fk -> chapters(id) on delete cascade unique`, `book_id uuid fk -> books(id) on delete cascade`, `summary text not null`, `token_count int not null`, `model text not null`, `generated_at timestamptz not null default now()` |

**Extended in `books`:**

- Add columns: `ingestion_progress int not null default 0 CHECK (ingestion_progress BETWEEN 0 AND 100)`, `ingestion_last_stage text` (for retry resumption), `ingestion_started_at timestamptz`, `indexed_at timestamptz`. Via `drizzle/0003_chapters_chunks.sql`.

**Indexes:**

- `chapters(book_id, ordinal)` — natural order.
- `chunks(book_id, chapter_id, ordinal)` — natural order for iteration.
- `chunks(book_id) where embedding is null` — partial index for "which chunks still need embedding" queries (embed stage).
- `chunks(chapter_id)` — for chapter-scoped retrieval (Feature 003).
- **HNSW index on `chunks.embedding`** via hand-edited SQL in `0003_chapters_chunks.sql`: `CREATE INDEX chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);`. pgvector 0.8+ supports this directly.

**Migration sequencing:** `0003_chapters_chunks.sql` is generated by `drizzle-kit`, then hand-edited to ADD the HNSW index line (Drizzle doesn't emit it natively yet). This is the second legitimate hand-edit case (first was Foundation's `0000_init.sql` adding extensions).

### API Endpoints

`apps/api` (Hono, extending `library.ts` route file):

| Method | Path | Body / Query | Response |
|---|---|---|---|
| POST | `/api/library/books/:id/ingest` | empty body, `Idempotency-Key` header | 202 envelope `{ data: { book_id, status, stage, job_id } }` |
| GET | `/api/library/books/:id/ingestion` | path param | 200 envelope `{ data: IngestionStatusDto }` |
| POST | `/api/library/books/:id/ingest/retry` | empty body, `Idempotency-Key` header | 202 envelope `{ data: { book_id, resuming_stage, job_id } }` |
| GET | `/api/library/chunks/:id` | path param | 200 envelope `{ data: ChunkReadDto }` |

**IngestionStatusDto shape** (Zod in `@dialogus/shared/schemas/ingestion.ts`):

```typescript
{
  book_id: uuid,
  status: IngestionStatus,          // 'discovered' | 'downloading' | ... | 'summarizing' | ... | 'ready' | 'failed'
  stage: 'download' | 'clean' | 'parse' | 'chunk' | 'summarize' | 'embed' | 'index' | null,  // null when ready/discovered
  progress: number,                                      // 0-100 within current stage
  started_at: ISOdate | null,
  indexed_at: ISOdate | null,
  last_stage: string | null,                            // for retry context
  error: { message, retryable, slug } | null
}
```

**Error slugs added to `problem` middleware and README "API Problems":**

- `book-not-in-discovered-state` (409) — `/ingest` called on non-discovered book.
- `book-not-in-retryable-state` (409) — `/retry` called on book not in `failed`.
- `book-already-ready` (409) — `/retry` on `ready` book.
- `ingestion-download-failed` (503) — download stage upstream failure, retryable.
- `ingestion-parse-failed` (422) — EPUB malformed or no chapters detected.
- `ingestion-summarize-failed` (503) — Anthropic upstream failure during summarize stage, retryable (NEW — ADR-008).
- `ingestion-embed-failed` (503) — OpenAI upstream failure, retryable.
- `chunk-not-found` (404) — `/chunks/:id` with unknown id.

## Integration Points

| Service | Purpose | Auth | Retry / error |
|---|---|---|---|
| Gutenberg mirror (`aleph.gutenberg.org`) | Book file download | User-Agent: `dIAlogus/0.1 (+igortullio@gmail.com)` | 2× exponential retry on 5xx with 1-2s base; 1s jitter between requests serialized at adapter level |
| OpenAI Embeddings API | `text-embedding-3-small`, 1536d | `OPENAI_API_KEY` | `@ai-sdk/openai` built-in retry; explicit 429 handling with exponential backoff; 500 RPM / 1M TPM Tier-1 limits respected |
| Anthropic API (NEW — ADR-008) | `claude-haiku-4-5` for chapter summaries | `ANTHROPIC_API_KEY` | `@ai-sdk/anthropic` built-in retry; bottleneck rate limiter at 30 RPM; per-chapter summary call |
| Postgres 18 + pgvector | `chapters`, `chunks`, `chapter_summaries` tables, HNSW index, pg-boss job queue | `DATABASE_URL` | Drizzle errors bubble to problem middleware; pg-boss handles its own retries per job |

## Impact Analysis

| Component | Impact | Risk | Action |
|---|---|---|---|
| `@dialogus/ingestion` | new package with 4 domain ports + 6 use cases + 6 adapters | high (first multi-port package with external I/O) | Biggest task surface; decompose carefully |
| `apps/worker` | new app (first background process) | medium (new boot path, process lifecycle) | Step 2 of Build Order; simple shell that registers handlers |
| `@dialogus/db` `chapters`, `chunks` + migration 0003 | schema changes | medium (first pgvector HNSW index; hand-edited migration) | Step 3; smoke migration on fresh Testcontainers DB |
| `apps/api` library routes + new endpoints | modified | medium (adds 4 endpoints + status transition guards) | Step 9 |
| `apps/api` — cleanup job removal | modified | low (deletion) | Step 2 |
| `apps/web` landing | modified | low (adds "prontos: N") | Step 12 |
| `@dialogus/shared/schemas/ingestion` | new | low | Step 1 |
| `problem.ts` middleware | extended (new slugs) | low | Step 9 |
| CI `integration` job | extended (new test suites) | medium (large-book test) | Step 11 |

## Testing Approach

### Unit Tests

- **Stage handlers**: inject mock repositories + mock `EmbeddingProvider` + mock `ChapterParser`; assert per-stage logic + idempotency-check behavior.
- **`GutenbergCleaner`**: fixture inputs (3 real Gutenberg dumps, EN + PT) with expected cleaned output.
- **`TxtChapterParser`**: YAML-loaded heuristics exercised against 3 EN + 3 PT reference books; each book produces ≥ 3 chapters.
- **`EpubChapterParser` (both `@gxl/epub-parser` and `epub2` fallback)**: fixtures in `packages/ingestion/__fixtures__/epub/` — small EN EPUB + small PT EPUB.
- **`MockEmbeddingProvider`**: same input produces same vector; different inputs produce different vectors; all outputs are unit-length 1536-dim.
- **`OpenAIEmbeddingProvider`** via MSW: 200 path, 429 retry path, 5xx retry-then-fail path.
- **Chunker**: paragraph-packing respects target 768 tokens + 10-15% overlap; never splits mid-paragraph; handles single-giant-paragraph edge case.
- **Ingestion status composition**: given a mocked `books` row state, `IngestionStatusDto` composes correctly.

Target: ≥ 80 % coverage on `@dialogus/ingestion`.

### Integration Tests

- **`migration-0003.integration.test.ts`** — applies `0000_init` + `0001_books` + `0002_idempotency_keys` + `0003_chapters_chunks`; asserts tables, HNSW index, partial indexes exist.
- **`ingestion-happy.integration.test.ts`** — ingests a small fixture EPUB (committed in `__fixtures__/`) end-to-end through all 6 stages against Testcontainers + MSW (mocked Gutendex + mocked OpenAI via `MockEmbeddingProvider`); asserts final `books.ingestion_status = 'ready'` + chapter count + chunk count + embedding non-null.
- **`ingestion-retry.integration.test.ts`** — simulates embed-stage failure mid-book, calls `/retry`, asserts resume behavior: download/parse/chunk outputs preserved, only missing embeddings generated.
- **`ingestion-large-book.integration.test.ts`** — runs against a ≥ 400k-token synthetic fixture (generated in test setup); asserts ingestion completes without OOM (run with `--max-old-space-size=200`); ADR-004 enforcement.
- **`chunks-read.integration.test.ts`** — `GET /api/library/chunks/:id` returns the expected envelope with chapter + book metadata.

Integration tests stay CI-only + on-demand local (per product ADR-007).

### E2E Tests

Not in Feature 002. Feature 004 adds one.

### Manual Smoke (before closing Feature 002)

1. `docker compose up -d && pnpm db:migrate && pnpm dev`.
2. Add Moby Dick, Dom Casmurro, Crime and Punishment via Feature 001 cURL.
3. Call `POST /ingest` on each; poll `/ingestion` until `ready`.
4. Verify `GET /api/library/chunks/<any-id>` returns text + chapter context.
5. Force a failure (e.g., unplug network mid-embed); observe `failed` state; `/retry`; verify recovery.
6. Ingest War and Peace or Les Misérables; verify `ready` state + memory footprint.
7. Landing shows "livros: 3 (prontos: 3)".
8. CI green on all jobs including 5 new ingestion integration suites.

## Development Sequencing

### Build Order

1. **`@dialogus/shared/schemas/ingestion` + new problem slugs** — no deps
   - Add `IngestionStatus` enum + `IngestionStatusDto` + `ChunkReadDto` schemas.
   - Extend `problem.ts` middleware with new slugs (step 9 also touches this).

2. **`apps/worker` scaffold + migrate catalog cleanup from apps/api** — no deps on other Ingestion tasks (per ADR-005 migration)
   - Create `apps/worker/package.json`, `tsconfig.json`, `src/index.ts`.
   - Move `catalog-cleanup-idempotency-keys` handler from `apps/api/src/jobs/` to `apps/worker/src/handlers/`.
   - Remove pg-boss client from `apps/api/src/index.ts` boot; remove `boss.schedule` + `boss.work` there.
   - Update Foundation task_15 reference in this TechSpec doc only — the code change is part of this step.
   - Root `pnpm dev` parallelizes api + worker + web (Turborepo or `pnpm --parallel -r dev`).

3. **`@dialogus/db` schemas + migration 0003** — depends on 2
   - `src/schema/chapters.ts` + `src/schema/chunks.ts` Drizzle tables.
   - `books` extension columns (progress, last_stage, indexed_at, started_at).
   - `pnpm db:generate` → hand-edit `0003_chapters_chunks.sql` to add HNSW index (`CREATE INDEX ... USING hnsw (embedding vector_cosine_ops) ...`) + partial index on embedding-is-null.
   - Commit with changelog note on hand-edit rationale.

4. **`@dialogus/ingestion` domain layer** — depends on 1
   - `domain/chapter/{Chapter.ts, ChapterRepository.port.ts}`.
   - `domain/chunk/{Chunk.ts, ChunkRepository.port.ts}`.
   - `domain/embedding/EmbeddingProvider.port.ts`.
   - `domain/parser/ChapterParser.port.ts`.
   - `domain/ingestion/IngestionError.ts` (6 error classes mirroring stages).
   - Barrel exports domain + ports only.

5. **`@dialogus/ingestion` infrastructure — persistence** — depends on 3, 4
   - `infrastructure/persistence/DrizzleChapterRepository.ts` + `DrizzleChunkRepository.ts`.
   - `infrastructure/persistence/mappers/{ChapterMapper,ChunkMapper}.ts`.
   - Unit tests via mocked Drizzle client.

6. **`@dialogus/ingestion` infrastructure — external adapters** — depends on 4
   - `infrastructure/external/GutendexDownloader.ts` — fetch + streaming to disk + SHA-256 + User-Agent + rate limiter.
   - `infrastructure/external/OpenAIEmbeddingProvider.ts` — `@ai-sdk/openai` batched embed.
   - `infrastructure/external/MockEmbeddingProvider.ts` — deterministic hash-based unit vectors.
   - MSW fixtures for Gutenberg + OpenAI.

7. **`@dialogus/ingestion` infrastructure — parsing** — depends on 4
   - `infrastructure/parsing/chapter-heuristics.yaml` + Zod schema + loader.
   - `infrastructure/parsing/EpubChapterParser.ts` (`@gxl/epub-parser`).
   - `infrastructure/parsing/EpubChapterParserEpub2.ts` (fallback).
   - `infrastructure/parsing/TxtChapterParser.ts` (YAML-driven regex).
   - `infrastructure/parsing/GutenbergCleaner.ts` (boilerplate stripper).
   - Fixtures in `__fixtures__/epub/` + `__fixtures__/txt/` for EN + PT.

8. **`@dialogus/ingestion` application layer — stage handlers** — depends on 5, 6, 7
   - `application/stages/download.ts` through `application/stages/index.ts` — six handlers implementing `StageHandler` shape from Core Interfaces.
   - Each handler: read book state, check upstream "already done", perform work (streaming), write DB incrementally, update `ingestion_status` + `ingestion_progress`, enqueue next stage via injected `pgboss`.
   - Unit tests with in-memory ports.

9. **`apps/api` library route extensions** — depends on 1, 3, 8
   - Add 4 new routes in `library.ts`: POST /ingest, GET /ingestion, POST /ingest/retry, GET /chunks/:id.
   - Guards: `/ingest` rejects non-discovered books; `/retry` rejects non-failed books.
   - Idempotency middleware applied to `/ingest` + `/retry`.
   - Extend problem middleware with new slugs.

10. **`apps/worker` ingestion handler registration** — depends on 8
    - `apps/worker/src/index.ts` imports all 6 stage handlers + catalog-cleanup handler.
    - `boss.work('ingestion.download', { teamConcurrency: 1 }, downloadHandler)` and similar for each queue.
    - `boss.schedule('catalog.cleanup-idempotency-keys', '0 * * * *', {})` (hourly).
    - Graceful shutdown via SIGTERM.

11. **CI integration job extension** — depends on 9, 10
    - 5 new `*.integration.test.ts` suites added under `apps/api/__tests__/integration/`.
    - Extend `vitest.integration.config.ts` include list if needed (default picks them up).
    - `integration` job in `ci.yml` runs them; wall-clock stays ≤ 15 min total.

12. **`apps/web` landing extension** — depends on 9 or 10 (routes available)
    - `apps/web/src/lib/library.ts` adds `fetchLibraryCountByStatus()` returning `{ total, ready }` from a single `GET /api/library/books?limit=1&status=ready` + a second call to total count.
    - `src/app/page.tsx` renders "livros: X (prontos: N)".

13. **Manual smoke + closure** — depends on 11, 12
    - Full dogfood sequence; 3+ books ingested; retry smoke; large-book smoke; landing verification.
    - Annotate `_prd.md` Exit Criteria Verification.
    - Commit `chore(repo): close feature 002-ingestion`.

### Technical Dependencies

- `@gxl/epub-parser`, `epub2` (fallback), `@ai-sdk/openai`, `js-tiktoken` (token counting), `yaml` (YAML loader), `bottleneck` (rate limiter for Gutenberg) added to `@dialogus/ingestion/package.json`.
- `pg-boss@^12` already installed via `@dialogus/db`.
- Testcontainers harness already in place from Feature 001.
- No new env vars beyond product TechSpec's existing `OPENAI_API_KEY` + `ANTHROPIC_API_KEY` (the latter is for Feature 003).

## Monitoring and Observability

- **Structured logs** per stage: `{ trace_id, book_id, gutendex_id, stage, stage_duration_ms, chapters_count?, chunks_count?, embeddings_count? }`.
- **Stage transitions logged at INFO**: `{ event: 'stage_transition', book_id, from, to, duration_ms }`.
- **Stage failures logged at ERROR**: `{ event: 'stage_failed', book_id, stage, error_slug, error_message, retryable }`.
- **Gutendex download telemetry**: `{ gutendex_id, cache_hit: boolean, bytes, duration_ms }`.
- **OpenAI embedding telemetry**: `{ batch_size, tokens, duration_ms, cost_usd? }`.
- No external APM (per product ADR scope).

## Technical Considerations

### Key Decisions

1. **6-stage pg-boss chain** (feature ADR-001) — per-stage progress + resume trivially.
2. **Serial concurrency** (feature ADR-002) — respects Gutenberg; simple ops.
3. **Resume from failed stage + SHA-256** (feature ADR-003) — preserves upstream work.
4. **Streaming discipline** (feature ADR-004) — any book size, ≤150 MB peak memory.
5. **apps/worker as sole pg-boss worker** (feature ADR-005) — cleanup job migrates from apps/api; single-responsibility split.
6. **Chapter heuristics in YAML file** (feature ADR-006) — data-driven, dogfood-friendly extension without recompile.
7. **Flat per-stage storage layout** (feature ADR-007) — `./storage/raw/<gutendex_id>.<ext>`, `./storage/clean/<gutendex_id>.txt`; simple, unix-native.
8. **`@gxl/epub-parser` primary, `epub2` fallback** — both implementations behind `ChapterParser` port; runtime fallback if primary throws on a specific book.
9. **Chunk target 768 tokens + 10-15% overlap** (PRD Open Question resolved) — 2026 benchmark-informed; paragraph-aligned first.
10. **HNSW index via hand-edited migration** — Drizzle doesn't emit pgvector-specific index DDL; this is the second sanctioned hand-edit.
11. **`books` table extensions** (progress, last_stage, indexed_at, started_at) — kept in `books` rather than a separate `ingestion_state` table; each book has exactly one lifecycle, 1:1 relationship is correct.
12. **`js-tiktoken` for token counting** — pure JS, no WASM, cl100k_base encoding (same family as OpenAI embeddings).
13. **Gutendex User-Agent**: `dIAlogus/0.1 (+igortullio@gmail.com)` — polite identification with contact for any upstream concerns.
14. **`bottleneck` for rate limiting** — per-adapter limiter on `GutendexDownloader` (1 request per 1000ms min, 2000ms max jitter).

### Known Risks

- **pgvector HNSW index build performance on bulk insert** — chunks inserted during streaming embed may trigger incremental HNSW updates. Mitigation: indexes are `WHERE embedding IS NOT NULL` (partial), so empty chunks don't pollute; final `ANALYZE` after index stage ensures fresh stats.
- **`@gxl/epub-parser` on PT EPUBs** — unverified until fixtures arrive. Mitigation: `epub2` fallback behind the `ChapterParser` port; if `@gxl/epub-parser` throws on a PT book, adapter catches and re-tries with epub2.
- **YAML heuristics Zod-schema drift** — a pattern author forgets a required field and boot fails. Mitigation: Zod parse produces grouped error listing exact missing fields; heuristics file is tiny (≤ 200 lines).
- **pg-boss job payload size** — stage payloads are just `{ bookId }`, so no payload-size concern; if future stages need richer payloads, pg-boss has a 100KB default limit.
- **Worker restart during long embed batch** — pg-boss retries from the start of the job by default. Mitigation: `ingestion.embed` handler is idempotent (only embeds `WHERE embedding IS NULL`); restart-mid-batch simply continues from the next batch.
- **Concurrent `POST /ingest` on the same book** — Idempotency-Key middleware catches replays. Without key, two fast calls both enqueue; handler reads book state and only the first advances status (second becomes no-op).

## Architecture Decision Records

- [ADR-001: Six-stage pipeline as chained pg-boss jobs](adrs/adr-001.md) — each stage is its own job queue.
- [ADR-002: Serial ingestion](adrs/adr-002.md) — concurrency=1 across all ingestion queues.
- [ADR-003: Resume from failed stage via SHA-256 checkpoint](adrs/adr-003.md) — retry re-runs only the failed stage and downstream.
- [ADR-004: Streaming discipline from day 1](adrs/adr-004.md) — no stage holds the full book in memory.
- [ADR-005: apps/worker as sole pg-boss worker](adrs/adr-005.md) — catalog cleanup job migrates from apps/api; single-responsibility split.
- [ADR-006: Chapter heuristics in a YAML data file](adrs/adr-006.md) — Zod-validated at boot; extensible without recompile.
- [ADR-007: Flat per-stage storage layout](adrs/adr-007.md) — `./storage/raw/` + `./storage/clean/` with `<gutendex_id>.<ext>` filenames.
- [ADR-008: Chapter-summary generation as a seventh ingestion stage](adrs/adr-008.md) — `summarize` stage between `chunk` and `embed`; new `chapter_summaries` table; Anthropic Haiku as summary generator. Amendment driven by Feature 003 ADR-001.
