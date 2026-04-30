# Workflow Memory

Keep only durable, cross-task context here. Do not duplicate facts that are obvious from the repository, PRD documents, or git history.

## Current State

- Per `_tasks.md` source-of-truth: tasks 01–15, 17 complete; 16, 18 still pending.
- Public surface to import from:
  - `@dialogus/shared/http` — `envelope`, `problemDetails`, `PROBLEM_TYPE_PREFIX`, `encodeCursor`, `decodeCursor`, `InvalidCursorError` (subpath `@dialogus/shared/http/cursor`).
  - `@dialogus/shared/schemas/book` — `bookDtoSchema`, `gutendexBookSchema`, `bookAuthorSchema` (+ `BookDto`, `GutendexBook`, `BookAuthor`).
  - `@dialogus/shared/schemas/catalog` — `searchRequestSchema`, `searchResponseSchema`, `searchLanguageEnum`, `searchSortEnum` (+ `SearchRequest`, `SearchResponse`, `SearchLanguage`, `SearchSort`).
  - `@dialogus/shared/schemas/library` — `addBookRequestSchema`, `listLibraryQuerySchema`, `bookResponseSchema`, `listLibraryResponseSchema`, `libraryLanguageEnum` (+ inferred types).
  - `@dialogus/shared/errors` — `IdempotencyKeyConflictError` (code `IDEMPOTENCY_KEY_CONFLICT`).
  - `@dialogus/db/schema` — `books`, `idempotencyKeys`, `INGESTION_STATUS_VALUES`, `IngestionStatus`. Migrations `0001_books.sql`, `0002_idempotency_keys.sql`.
  - `@dialogus/db/pgboss` — pg-boss types + `createPgBoss(DATABASE_URL)`.
  - `@dialogus/catalog` (barrel) — entities, ports, errors (+ `GutendexValidationError`), use cases, application types, `INGESTION_STATUS_VALUES`. `infrastructure/` is **permanently** excluded from the barrel — `DrizzleBookRepository` and `GutendexHttpClient` are imported by deep path.
- Committed MSW fixtures live at `packages/catalog/__fixtures__/gutendex/` (5 JSON + `handlers.ts`). Reusable across features 001–004 via `setupServer(...happyPathHandlers)`. Use `FIXTURE_BASE_URL = 'https://gutendex.test'` and inject it as `new GutendexHttpClient({ baseUrl: FIXTURE_BASE_URL })`.
- `apps/api/src/index.ts` boot wiring: request-id → global problem middleware → `/health` → caller-provided `routes`. Starts a runtime `PgBoss`, ensures + schedules `catalog.cleanup-idempotency-keys` (`0 * * * *`), shuts down via `boss.stop({ graceful: false }) → server.close() → db.$client.end()`.
- README "API Problems" list (task_18) must enumerate ≥ 7 slugs including `internal-error` and `gutendex-validation-failed`.

## Shared Decisions

- Problem-Details `type` URI namespace is `urn:dialogus:problems:<slug>` (ADR-002). Use exported `PROBLEM_TYPE_PREFIX`; never hard-code.
- `problemDetails(slug, status, detail?, errors?)` derives `title` from the slug. HTTP helpers stay framework-agnostic; `instance` is the route/middleware's responsibility.
- Use Zod v4 idiomatic forms (`z.iso.datetime()`, `z.uuid()`); ADR snippets are intent, not literal API.
- Catalog error classes extend `DialogusError` with hard-coded codes/slugs: `DUPLICATE_GUTENDEX_ID`/`duplicate-gutendex-id` (with optional `existingBookId`), `BOOK_NOT_FOUND`/`book-not-found`, `GUTENDEX_UPSTREAM_ERROR`/`gutendex-upstream-error` (with `upstreamStatus`), `GUTENDEX_VALIDATION_FAILED`/`gutendex-validation-failed` (with Zod `issues[]`). The validation slug is **not yet wired** in `apps/api/src/infrastructure/http/middleware/problem.ts` — task_13 must add the mapping (recommended: 502 + `gutendex-validation-failed`).
- `IdempotencyKeyConflictError(key, message?)` lives in `@dialogus/shared/errors` → 422 + slug `idempotency-key-conflict`. `InvalidCursorError` → 400 + slug `invalid-cursor`.
- `canonicalizeBody(body)` is exported from `apps/api/src/infrastructure/http/middleware/idempotency.ts` (recursive key-sort, SHA-256 hex).
- Idempotency middleware: reads `c.req.json()` once (Hono caches), captures response via `c.res.clone().text()` + JSON.parse fallback. Non-2xx not stored. Header `X-Idempotency-Replay: true` on replay.
- Hono `compose` routes handler `Error` throws through `app.errorHandler`. Problem middleware: `await next()` → inspect `c.error` → if `Error`, override `c.res` and clear `c.error`.
- Drizzle migrations: generate with `pnpm --filter @dialogus/db exec drizzle-kit generate --name=<slug>` (plain `pnpm db:generate` auto-suffixes incompatibly). ADR-002 forbids hand-editing the SQL.
- `db:reset` is broken (migrate.ts lacks `--reset`). Until fixed, fresh-DB verification drops/creates via `docker exec dialogus-postgres-1 psql ...` then `pnpm --filter @dialogus/db db:migrate`.
- Canonical `IngestionStatus` tuple (post-ADR-008, 10 values): `discovered | downloading | cleaning | parsing | chunking | summarizing | embedding | indexing | ready | failed` — exported as `ingestionStatusEnum`/`INGESTION_STATUS_VALUES` from `@dialogus/shared/schemas/ingestion`. All schemas re-use this enum; do not redeclare.
- Wire DTO convention is **snake_case** across `@dialogus/shared/schemas/*` (book, catalog, library, ingestion, chat, thread). The catalog `Book` domain entity is camelCase; route layer maps domain → snake_case DTO via `BookMapper`-style transforms.
- `bookDtoSchema` **omits `raw_hash`** by design — it is an internal SHA-256 of the raw Gutendex JSON for change detection, not a client concern. `.strip()` default silently drops it from upstream input.
- Use `z.stringbool()` (Zod 4.3+) for query-string booleans — `z.coerce.boolean()` treats `'false'` as `true` and is wrong for HTTP query parsing.
- `@dialogus/catalog` domain owns its enums/ports. Adapters MUST satisfy `domain/book/{BookRepository,GutendexClient}.port.ts`.
- `GutendexHttpClient` (per ADR-004): `lru-cache@^11` `{max:500, ttl:60_000}`, cache key `GET ${path}?<sortedQueryString>` (params sorted alphabetically, `languages` array also sorted), cache value is the camelCase domain DTO not raw JSON. Retry budget = 1 (2 total attempts) with `500 * 2**attempt` backoff for 5xx + network errors; 4xx is fatal-no-retry. Validation uses `gutendexBookSchema.strip()`; failures throw `GutendexValidationError` with Zod issues attached.
- pg-boss runtime client ownership: schema migration owned by `db:migrate`; per-process runtime clients owned by `apps/api/src/index.ts` (and any future `apps/worker`). `apps/api` does NOT direct-dep `pg-boss` — types via `@dialogus/db/pgboss`.
- pg-boss 12: `boss.createQueue(name)` is NOT idempotent (throws if exists) — probe via `boss.getQueue(name)` then create when null. `boss.schedule(name, cron, data)` IS upsert-safe.
- Boot composition contract: `start({ routes? })` accepts `ReadonlyArray<{ prefix: string; app: Hono }>`; do NOT add `app.use`/`app.route` inside `start()`. `BootResult.boss` is exposed for boot-time enqueueing.
- Pino: `stdSerializers.err` does not auto-apply to non-`err` keys. Production logger registers `serializers: { error: stdSerializers.err }`; tests asserting `error.stack` must register the same serializer on captured loggers.

## Shared Learnings

- Repo lint baseline: 5 pre-existing `noTemplateCurlyInString` warnings in foundation `__tests__/{ci-workflow,docker-compose}.test.ts`. New code must not add to that count.
- `tsconfig` enforces `noUncheckedIndexedAccess`; Biome forbids `noNonNullAssertion`. Indexed access on possibly-empty arrays/strings must use real guards or `String.prototype.charAt`.

## Open Risks

- Pre-existing flake under repo-wide concurrent `pnpm test`: `packages/ingestion/__tests__/infrastructure/external/GutendexDownloader.test.ts:158` ("serializes back-to-back calls at least minTime=1000ms apart") fails intermittently with timings like 997–999 ms. Passes consistently in isolation. Bottleneck timing-budget on shared CPU under parallel test pressure. Unrelated to catalog work; may need `>=995` tolerance in a future ingestion patch.

## Handoffs

- Catalog/library routes throw the catalog error classes freely — global Problem middleware converts them. Middleware reads `trace_id` from `c.get('traceId') ?? c.req.header('x-trace-id')`.
- Idempotency middleware is opt-in per-route — apply on `POST /api/library/books` INSIDE the global problem middleware so `IdempotencyKeyConflictError` becomes 422.
- Integration tests for `apps/api` live at `apps/api/__tests__/integration/*.integration.test.ts` using Testcontainers (`@testcontainers/postgresql`, image `pgvector/pgvector:pg18`). `pnpm test:integration` at root delegates via `--filter=@dialogus/api` to `vitest run --config vitest.integration.config.ts`. Tests guard via `describe.skipIf(!dockerAvailable)`. CI `integration` job gates `build`. As features 002-004 add suites, extend the root filter (pnpm 9 selectors match by package name, not path).
- Foundation root `__tests__/*.integration.test.ts` files (db-migrate, docker-compose, prepare-hook, pre-commit) are orphaned from `pnpm test:integration` after task_17. Run them via `pnpm exec vitest run --config ./vitest.integration.config.ts`.
