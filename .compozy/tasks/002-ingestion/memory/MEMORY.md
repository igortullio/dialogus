# Workflow Memory

Keep only durable, cross-task context here. Do not duplicate facts that are obvious from the repository, PRD documents, or git history.

## Current State

- Done: all tasks 01-24. Seven-stage pipeline live (download → clean → parse → chunk → **summarize** → embed → index); worker registers all 7 stages + cleanup cron; integration suites cover happy / retry-from-summarize-failure / EN+PT language plumbing.
- Feature 002 closed 2026-04-30.

## Shared Decisions

- `apps/worker` is the sole long-running pg-boss worker (ADR-005). All `boss.work(...)` / `boss.schedule(...)` live in `apps/worker/src/index.ts`; `apps/api` enqueues via `apps/api/src/infrastructure/pgboss/enqueue.ts` (start → send → stop). Importable as `@dialogus/worker` / `@dialogus/worker/deps`. Root `pnpm dev` filter: `--filter @dialogus/api --filter @dialogus/worker --filter @dialogus/web`.
- `books.ingestion_status` enum order: `discovered, downloading, cleaning, parsing, chunking, summarizing, embedding, indexing, ready, failed`. Duplicated in three places — `@dialogus/shared/schemas/ingestion`, `packages/db/src/schema/books.ts`, `packages/catalog/src/domain/book/IngestionStatus.ts`; touching the value list means updating all three plus their scaffold/Book tests.
- Stage handlers are pure `(payload, deps) => Promise<void>` taking narrowed `Pick<StageDeps, ...>`. Common helpers in `packages/ingestion/src/application/stages/_common.ts` (`findBookForStage`, `updateBookState`, `INGESTION_QUEUES`, `INGESTION_ERROR_SLUGS`, `preferredFormat`, `rawFilePath`, `cleanFilePath`, `StageLogger`); optional `deps.storageRoot` defaults to `./storage`.
- StageDeps: two ChapterParser ports (`chapterParser` EPUB + `txtChapterParser` TXT). `BookRecordForStage.languages: readonly string[]`; resolve to `SupportedLanguage` by lowercasing + 2-char prefix, default `'en'`. Stream chapters via `ChapterRepository.streamByBookId` (keyset on `(bookId, ordinal)` batch 25).
- All 7 `INGESTION_QUEUES` `ensureQueue`'d + `boss.work`-registered at boot. Summarize handler lives in `apps/worker/src/handlers/ingestion-summarize.ts` (factory) and is registered in `apps/worker/src/index.ts` separately from the 6-handler `INGESTION_STAGE_HANDLERS` array because its deps shape extends `StageDeps` with `chapterSummaryRepo` + `chapterSummaryGenerator`.
- Worker handler registration: `boss.work(queue, { batchSize: 1 }, (jobs) => for-each handler(job.data, deps))` (pg-boss v12 dropped `teamConcurrency`). Cleanup uses 2-arg form.
- `composeStageDeps` (`apps/worker/src/deps.ts`) returns `{ deps, chapterSummaryRepo, chapterSummaryGenerator, embeddingProvider, summaryGenerator }`. Generator selection: env `SUMMARY_GENERATOR=mock|anthropic`, defaults to anthropic in production, mock otherwise. Anthropic without `ANTHROPIC_API_KEY` → fail-fast `SummaryGeneratorConfigError` at boot.
- `packages/ingestion/package.json` has subpath exports `"./*": "./src/*.ts"`. Concrete adapters stay deep-import-only by convention; `__tests__/scaffold.test.ts` allowlist carves out `DrizzleChapterSummaryRepository` (Feature 003 ADR-006).
- Path params validated inline via `z.object({ id: z.uuid() }).parse(c.req.param())`; ZodError flows through existing problem middleware.
- Integration tests inject the summary generator via `startTestWorker({ chapterSummaryGenerator })`; default is `MockChapterSummaryGenerator`. The earlier `registerSummarizeBridge` shim is removed.
- `MockChapterSummaryGenerator` output now includes a `[lang=<en|pt>]` marker so EN/PT plumbing is observable in DB rows without asserting LLM quality.
- `TxtChapterParser` ordinals start at 1 (not 0) — first chapter is ordinal 1.

## Shared Learnings

- pg-boss v12: `send(name, data) → Promise<string | null>` (null on singleton/throttle conflict). `WorkHandler` is `(jobs: Job<ReqData>[]) => Promise<...>` — always batched even with `batchSize: 1`.
- `drizzle-kit generate` produces randomly-suffixed filenames; pass `--name <slug>` (the `db:generate` script forwards args). `DATABASE_URL` env required even though no connection is opened.
- Drizzle 0.30 column-level `.unique()` emits CONSTRAINT but is NOT in `getTableConfig(table).uniqueConstraints` — schema tests must read column-level `isUnique` flag.
- Drizzle 0.45 pg-core has no `.iterator()`. Use keyset pagination on the standard query builder.
- Drizzle `vector` returns parsed `number[]` and accepts `JSON.stringify(arr)`. Batch UPDATE: `UPDATE … FROM (VALUES …) AS v(id, embedding) WHERE …` with `${JSON.stringify(arr)}::vector` casts.
- AI SDK custom retry: prefer low-level `provider.<modality>(modelId).doEmbed(…)` / `.doGenerate(…)` over `embed`/`generateText`. `@ai-sdk/<provider>@3` returns `LanguageModelV3` while stable `ai@5` types `model: LanguageModelV2 | string`, so `generateText` won't typecheck against v3 providers.
- `LanguageModelV3 doGenerate` prompt shape: `prompt: Array<{ role, content, providerOptions? }>`. System uses `content: string`; user uses `content: Array<{ type: 'text', text }>`. Anthropic `cache_control: { type: 'ephemeral' }` goes under `providerOptions.anthropic.cacheControl`. Result content = `Array<LanguageModelV3Content>`; filter for `type: 'text'`.
- External-adapter test pattern: `setupServer(...handlers)` from `msw/node`, `server.listen({ onUnhandledRequest: 'error' })`. Pair with constructor-injected `fetchImpl?` / `sleep?` / `random?` seams.
- Adapter wiring: tests use deterministic mocks (`MockEmbeddingProvider`, `MockChapterSummaryGenerator`, etc.) under `packages/ingestion/src/infrastructure/external/`. Concrete external adapters are NOT re-exported from package barrel.

## Open Risks

- `apps/api` running alone without `apps/worker` leaves jobs stuck in "created" (ADR-005). Mitigated only by README callout.
- Feature 001 task_14 (catalog CRUD) marked completed but never committed. Feature 002 task_14 (`library.ts`) only has the four ingestion routes; Feature 001 task_14 must merge its five catalog routes into the existing `createLibraryRoute` factory when it lands.
- `packages/ingestion/__tests__/infrastructure/external/GutendexDownloader.test.ts` "minTime=1000ms" is timing-flaky (~1ms off). Rerun before debugging.

## Handoffs

- Feature 002 is fully closed. The closure commit is `chore(repo): close feature 002-ingestion [T018]`.
- `summarizeStage` deps shape stays narrowed at the use-case layer (`Pick<StageDeps, 'db' | 'logger' | 'pgboss' | 'chapterRepo'> & { chapterSummaryRepo, chapterSummaryGenerator }`); `chapterSummaryRepo` and `chapterSummaryGenerator` are NOT on the shared `StageDeps` interface — they live as separate fields on `ComposedStageDeps` and are passed explicitly by the worker handler factory.
- summarize handler returns CLEAN on `SummarizeError` (does not re-throw) — only handler in the pipeline that swallows. pg-boss marks job success; `/retry` is the operator path. Other handlers (download, clean, parse, chunk, embed, index) re-throw.
