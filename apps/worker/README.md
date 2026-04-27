# @dialogus/worker

The sole long-running pg-boss worker for dIAlogus (ADR-005). This process owns
every `boss.work(...)` and `boss.schedule(...)` registration in the workspace;
`apps/api` only enqueues jobs through transient pg-boss instances.

## Pipeline shape

After the ADR-008 amendment, ingestion is a **seven-stage chain** of pg-boss
queues, executed serially per book (`batchSize: 1` per queue, ADR-002):

```
download → clean → parse → chunk → summarize → embed → index
```

| # | Queue                  | Handler             | Purpose                                                    |
|---|------------------------|---------------------|------------------------------------------------------------|
| 1 | `ingestion.download`   | `downloadStage`     | Polite Gutendex fetch + SHA-256 + `./storage/raw/`         |
| 2 | `ingestion.clean`      | `cleanStage`        | Strip Gutenberg boilerplate → `./storage/clean/`           |
| 3 | `ingestion.parse`      | `parseStage`        | Yield chapters via EPUB parsers or `TxtChapterParser`      |
| 4 | `ingestion.chunk`      | `chunkStage`        | Paragraph-aligned token packing (≈768 tokens, 10–15% overlap) |
| 5 | `ingestion.summarize`  | `summarizeStage`    | One Anthropic Haiku summary per chapter (ADR-008)          |
| 6 | `ingestion.embed`      | `embedStage`        | OpenAI `text-embedding-3-small` (batches of ≤100 chunks)   |
| 7 | `ingestion.index`      | `indexStage`        | `ANALYZE` + `books.ingestion_status = 'ready'`             |

The cleanup of catalog idempotency keys (`catalog.cleanup-idempotency-keys`)
runs hourly via `boss.schedule` — also owned by this process.

## Adapters and process-lifetime composition

`composeStageDeps` (`src/deps.ts`) builds every adapter exactly once at boot so
that adapter-internal state survives across jobs:

- **Embedding provider**: `openai | mock`. Resolved from `EMBEDDING_PROVIDER`,
  defaults to `openai` when `NODE_ENV=production` and `mock` otherwise.
- **Chapter-summary generator**: `anthropic | mock`. Resolved from
  `SUMMARY_GENERATOR`, defaults to `anthropic` when `NODE_ENV=production` and
  `mock` otherwise. The Anthropic adapter holds a `bottleneck` rate limiter and
  a prompt-cache state — constructing it once per boot is load-bearing.
- **Drizzle repositories**: `chapters`, `chunks`, `chapter_summaries`.
- **Parsers**: EPUB primary + `epub2` fallback; YAML-driven `TxtChapterParser`.

The summarize handler (`src/handlers/ingestion-summarize.ts`) wraps
`summarizeStage` from `@dialogus/ingestion` with a logger pre-bound to
`stage: 'summarize'` and the composed `chapterSummaryRepo` +
`chapterSummaryGenerator`. Unlike the other ingestion handlers, the summarize
stage **swallows** `SummarizeError`: it marks the book `failed` in the database
and returns clean so pg-boss does not retry the job. Recovery is the operator's
explicit `/retry` path, which re-enqueues `ingestion.summarize` with the same
payload — already-saved summaries are skipped via `listMissingChapterIds`.

## Required runtime configuration

The worker shares the workspace `.env` (loaded via `loadEnvFromRoot`). For the
local-only env conventions, see `apps/worker/.env.example`. The keys that
matter at runtime:

| Variable             | Required when                                        |
|----------------------|------------------------------------------------------|
| `DATABASE_URL`       | always                                               |
| `OPENAI_API_KEY`     | `EMBEDDING_PROVIDER=openai` or `NODE_ENV=production` |
| `ANTHROPIC_API_KEY`  | `SUMMARY_GENERATOR=anthropic` or `NODE_ENV=production` |

If a generator/provider is selected without its key the worker fails fast at
boot with a `SummaryGeneratorConfigError` / `EmbeddingProviderConfigError`.

## Local development

From the repo root:

```sh
docker compose up -d         # postgres + pgvector + pg-boss schema
pnpm db:migrate              # apply Drizzle migrations 0000 → latest
pnpm dev                     # starts apps/api, apps/worker, apps/web in parallel
```

Running `apps/api` without `apps/worker` leaves enqueued jobs stuck in
`created` state — the API enqueues but never consumes. Always start both, or
queue work will pile up silently.

### Manual smoke

1. Add 1–3 books via Feature 001's catalog endpoints.
2. `POST /api/library/books/<uuid>/ingest` for each.
3. Poll `GET /api/library/books/<uuid>/ingestion` until `status === 'ready'`.
4. Verify `chapter_summaries` has one row per chapter and `chunks.embedding`
   is non-null for every row.
5. To exercise resume: kill the worker mid-summarize, restart, and observe the
   stage pick up from the failure point.
