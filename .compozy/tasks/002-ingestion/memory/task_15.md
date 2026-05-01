# Task Memory: task_15.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Wire all 6 ingestion stage handlers (download/clean/parse/chunk/embed/index) plus the catalog cleanup handler into `apps/worker/src/index.ts` with serial concurrency. Schedule the hourly cleanup cron, ensure graceful SIGTERM (15s timeout), and gate `MockEmbeddingProvider` vs `OpenAIEmbeddingProvider` selection on `EMBEDDING_PROVIDER` + `NODE_ENV` with explicit logging.

## Important Decisions

- `@dialogus/ingestion` package barrel still does not re-export concrete adapters. Added a `"./*": "./src/*.ts"` subpath pattern to its `package.json` exports so apps/worker can deep-import (`@dialogus/ingestion/application/stages/download`, `…/infrastructure/external/MockEmbeddingProvider`, etc.) without any new barrel files.
- Composed deps live in a dedicated `apps/worker/src/deps.ts` with a small testable `selectEmbeddingProvider(...)` function that owns the env-driven choice; the boot module in `index.ts` only consumes `composeStageDeps`. `start({ composeDeps })` accepts an override factory so boot tests stay free of real adapter construction.
- All seven ingestion queues (`ingestion.{download,clean,parse,chunk,summarize,embed,index}`) are `ensureQueue`'d at boot, but only six register a worker. The summarize queue exists so the chunk handler's downstream `boss.send('ingestion.summarize', …)` does not error — task_24 will register the consumer. Books therefore stop at `chunking → enqueued summarize` until task_24 lands.
- Cleanup `boss.work(name, handler)` keeps the existing 2-arg form (defaults). Each ingestion `boss.work(name, { batchSize: 1 }, handler)` uses the 3-arg form to make the serial intent explicit.

## Learnings

- pg-boss v12 dropped `teamConcurrency`; `WorkConcurrencyOptions` now exposes `localConcurrency`/`localGroupConcurrency`/`groupConcurrency`. The closest 1:1 mapping for the task spec's `teamConcurrency: 1` is `{ batchSize: 1 }` (one job per fetch). Defaults already give serial behavior, but passing `{ batchSize: 1 }` keeps the intent visible and assertable in tests.
- pg-boss v12 `WorkHandler` is `(jobs: Job<ReqData>[]) => Promise<...>` — a batch, not a single job. With `batchSize: 1` the array still has length 1; `buildIngestionWorker` iterates with `for (const job of jobs)` to be safe.
- `EpubChapterParserWithFallback({ logger })` expects a `{ warn(message, meta?) }` shape (not the pino `(meta, msg)` order). Wrap with `{ warn: (msg, meta) => logger.warn(meta ?? {}, msg) }` when injecting pino.
- `composeStageDeps` is safe to call in tests: every adapter constructor is pure (DrizzleChapter/ChunkRepository, GutendexDownloader, OpenAI/Mock embedding providers, EpubChapterParser{,Epub2,WithFallback}, TxtChapterParser). TxtChapterParser does load `chapter-heuristics.yaml` synchronously at construction via `loadChapterHeuristics()`, but that file ships in the package and resolves through `import.meta.url`.
- The default vitest reporter rejects `--reporter=basic`; pass nothing or use `--reporter=default` when re-running a single test through `npx vitest`.

## Files / Surfaces

- `apps/worker/src/index.ts` — full boot rewrite: ensures 7 ingestion + 1 cleanup queues, registers 6 ingestion handlers + cleanup handler, schedules hourly cron, logs `embedding_provider_selected`/`handler_registered`/`boot_complete`. Bumped `SHUTDOWN_TIMEOUT_MS` from 10s → 15s per task spec.
- `apps/worker/src/deps.ts` — new module with `selectEmbeddingProvider`, `composeStageDeps`, `EmbeddingProviderConfigError`.
- `apps/worker/__tests__/boot.test.ts` — extended; new assertions for queue ensuring, batchSize=1, schedule count, SIGTERM under 15s, embedding provider log.
- `apps/worker/__tests__/deps.test.ts` — new; covers provider selection matrix + composeStageDeps wiring.
- `apps/worker/package.json` — adds `@dialogus/ingestion: workspace:*`.
- `packages/ingestion/package.json` — adds `"./*": "./src/*.ts"` subpath export.

## Errors / Corrections

- Initial Write attempt to `/Users/igortillio/...` (typo'd path) errored EACCES — corrected path. No effect on repo state.
- Biome lint flagged import order + a long line; `pnpm lint:fix` resolved both. No semantic changes.
- One pre-existing flaky test in `packages/ingestion/__tests__/infrastructure/external/GutendexDownloader.test.ts:158` (`expected 999 to be greater than or equal to 1000`) failed once during full-suite run, passed on retry. Unrelated to task_15 and noted as a flake to address separately.

## Ready for Next Run

- task_16 (integration suites) can now boot the worker end-to-end against Testcontainers + MSW; the apps/worker boot module exposes `start({ logger, composeDeps })` so suites can inject test deps without touching real adapters.
- task_24 (summarize handler registration) will (a) add the summarize handler registration alongside the existing 6, (b) extend `INGESTION_STAGE_HANDLERS` in `apps/worker/src/index.ts`, and (c) update the boot test counts (7 ingestion handlers, 8 work registrations total).
