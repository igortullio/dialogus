# Feature 001: Book Catalog — Technical Specification

## Executive Summary

Catalog introduces the first domain package (`@dialogus/catalog`) and extends `apps/api` with the first hexagonal DDD layers (`domain/`, `application/`, `infrastructure/http/routes/`). Seven endpoints ship across `/api/catalog/*` (Gutendex gateway) and `/api/library/*` (local CRUD), all under a portfolio-grade contract: cursor pagination, RFC 9457 Problem Details, envelope `{data, meta, links}`, Idempotency-Key on POST, soft-delete + restore. Catalog additionally adds a new `@dialogus/shared/http` submodule with shared envelope / problem-details / cursor helpers that Features 002-004 reuse. Integration tests introduce Testcontainers for the first time in the project.

Primary trade-off: **upfront investment in cross-cutting utilities** (envelope wrappers, Problem Details middleware, Idempotency-Key storage, tuple-cursor codec) for **a coherent API contract that Features 002-004 inherit without re-designing**. The alternative — minimal catalog with per-endpoint error/pagination ad-hoc — was rejected in feature ADR-002 because inconsistency across four features compounds worse than a one-time utility investment.

## System Architecture

### Component Overview

```
apps/web                                  (modified)
  src/lib/health.ts                       adds .book_count to the response it renders
  src/app/page.tsx                        renders "livros: N" in the status line

apps/api                                  (extended)
  src/domain/book/                        placeholder — Book entity canonicalizes in @dialogus/catalog
  src/application/catalog/                HTTP-layer glue (DTO parsing + use-case invocation)
  src/infrastructure/http/middleware/idempotency.ts   Idempotency-Key read/write/replay
  src/infrastructure/http/middleware/problem.ts       RFC 9457 error converter
  src/infrastructure/http/routes/catalog.ts           GET /api/catalog/search, GET /api/catalog/books/:gutendex_id
  src/infrastructure/http/routes/library.ts           POST, GET, GET/:id, DELETE/:id, POST/:id/restore
  src/jobs/cleanup-idempotency-keys.ts                pg-boss job, runs hourly

packages/
  @dialogus/catalog                       (new)
    src/domain/book/Book.ts                  entity
    src/domain/book/BookRepository.port.ts   port
    src/domain/book/BookError.ts             DuplicateBookError, BookNotFoundError, GutendexUpstreamError
    src/domain/book/GutendexClient.port.ts   port
    src/application/searchGutendex.ts        use case (catalog namespace)
    src/application/getGutendexBook.ts       use case
    src/application/addBookToLibrary.ts      use case (library namespace)
    src/application/listLibrary.ts           use case
    src/application/getBook.ts               use case
    src/application/removeBook.ts            use case
    src/application/restoreBook.ts           use case
    src/infrastructure/persistence/DrizzleBookRepository.ts   adapter
    src/infrastructure/persistence/mappers/BookMapper.ts      domain↔db
    src/infrastructure/external/GutendexHttpClient.ts         adapter (fetch + lru-cache + Zod)
    src/index.ts                             barrel: only use cases + ports exported

  @dialogus/shared                        (extended)
    src/http/envelope.ts                     envelope({data, meta?, links?}) helper
    src/http/problem.ts                      problemDetails(slug, status, detail?, errors?) helper
    src/http/cursor.ts                       encodeCursor / decodeCursor tuple helpers
    src/schemas/book.ts                      Book DTO + Gutendex DTO Zod schemas
    src/schemas/catalog.ts                   search request / response
    src/schemas/library.ts                   library CRUD request / response
    src/index.ts                             re-export new submodules

  @dialogus/db                            (extended)
    src/schema/books.ts                      books table
    src/schema/idempotency_keys.ts           idempotency_keys table
    drizzle/0001_books.sql                   generated + no hand-editing
    drizzle/0002_idempotency_keys.sql        generated + no hand-editing
```

**Data flow — add a book from search:**

1. Client issues `GET /api/catalog/search?q=Don+Quixote&language=en`.
2. Hono route in `catalog.ts` parses request, calls `searchGutendex(query)` use case from `@dialogus/catalog`.
3. Use case delegates to `GutendexHttpClient` (adapter). Client checks `lru-cache` by cache-key (URL + params); on miss, fetches Gutendex, Zod-validates response with `.strip()` on unknown fields, maps to `Book[]` DTOs, stores in cache with 60s TTL.
4. Use case returns `{ books: Book[], nextPage: string | null }`.
5. Route wraps in envelope via `envelope({ data: books.map(toDTO), meta: { count }, links: { next, self, prev } })` and responds 200 with `application/json`.
6. Client then issues `POST /api/library/books` with `Idempotency-Key: X` and `{ gutendex_id: 996 }`.
7. `idempotency` middleware looks up key in `idempotency_keys`. On match with same request-hash → return cached response. On match with different hash → 422 Problem Details. On miss → proceed.
8. `problem` middleware wraps use-case invocation; `addBookToLibrary(gutendex_id)` runs: fetch Gutendex detail, map to domain, persist via `DrizzleBookRepository`. Returns `Book` with `status='discovered'`.
9. Response envelope `{ data: bookDTO }` with status 201; middleware stores it in `idempotency_keys` before returning.

## Implementation Design

### Core Interfaces

```typescript
// @dialogus/catalog/domain/book/Book.ts — entity
export interface Book {
  readonly id: string
  readonly gutendexId: number
  readonly title: string
  readonly authors: Array<{ name: string; birthYear: number | null; deathYear: number | null }>
  readonly languages: string[]
  readonly subjects: string[]
  readonly downloadUrlEpub: string | null
  readonly downloadUrlTxt: string | null
  readonly coverUrl: string | null
  readonly rawHash: string | null
  readonly ingestionStatus: IngestionStatus
  readonly ingestionError: string | null
  readonly tags: string[]
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly deletedAt: Date | null
}
```

```typescript
// @dialogus/catalog/domain/book/BookRepository.port.ts
export interface BookRepository {
  save(book: Book): Promise<Book>
  findById(id: string): Promise<Book | null>
  findByGutendexId(gutendexId: number): Promise<Book | null>
  list(filter: ListFilter, cursor?: Cursor, limit?: number): Promise<{ books: Book[]; nextCursor: Cursor | null }>
  softDelete(id: string): Promise<void>
  restore(id: string): Promise<Book>
}
export interface ListFilter { status?: IngestionStatus; language?: 'en' | 'pt'; includeDeleted?: boolean }
```

```typescript
// @dialogus/catalog/domain/book/GutendexClient.port.ts
export interface GutendexClient {
  search(query: GutendexSearchQuery): Promise<{ books: GutendexBook[]; nextPage: string | null; count: number }>
  getBook(gutendexId: number): Promise<GutendexBook>
}
export interface GutendexSearchQuery {
  q?: string
  languages?: Array<'en' | 'pt'>
  topic?: string
  sort?: 'popular' | 'ascending' | 'descending'
  page?: number
}
```

```typescript
// @dialogus/shared/http — cross-cutting utilities
export function envelope<T>(data: T, opts?: { meta?: Record<string, unknown>; links?: Record<string, string> }): { data: T; meta?: Record<string, unknown>; links?: Record<string, string> }
export function problemDetails(slug: string, status: number, detail?: string, errors?: ValidationIssue[]): ProblemDetails
export function encodeCursor(position: { createdAt: Date; id: string }): string   // base64(JSON.stringify({...}))
export function decodeCursor(cursor: string): { createdAt: Date; id: string }
```

### Data Models

**Drizzle-owned (catalog):**

| Table | Columns |
|---|---|
| `books` | `id uuid pk default uuid_generate_v4()`, `gutendex_id int unique not null`, `title text not null`, `authors jsonb not null`, `languages text[] not null`, `subjects text[] not null default '{}'`, `download_url_epub text`, `download_url_txt text`, `cover_url text`, `raw_hash text`, `ingestion_status text not null default 'discovered'` (enum via CHECK), `ingestion_error text`, `tags jsonb not null default '[]'`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `deleted_at timestamptz` |
| `idempotency_keys` | `key text pk`, `request_hash text not null`, `response_status int not null`, `response_body jsonb not null`, `created_at timestamptz not null default now()` |

**Indexes:**

- `books(gutendex_id)` — unique (from column constraint).
- `books(created_at desc, id desc) where deleted_at is null` — partial index for cursor pagination on active rows.
- `books(ingestion_status) where deleted_at is null` — partial index for status filter.
- `idempotency_keys(created_at)` — for cleanup job.

**Migration sequencing:** `0001_books.sql` (generated) first, then `0002_idempotency_keys.sql` (generated) — both via `drizzle-kit generate`, no hand-editing (extensions already installed by Foundation's `0000_init.sql`).

**`tags` column reservation:** column exists in V1 with default `[]`; no API surface reads or writes it. Schema-only reservation avoids a migration when Phase 2 introduces tagging UI.

### API Endpoints

`apps/api` (Hono):

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/api/catalog/search` | `?q&language&topic&sort&cursor&limit` | 200 envelope `{ data: Book[], meta: { count }, links: { next?, prev?, self } }` |
| GET | `/api/catalog/books/:gutendex_id` | path param | 200 envelope `{ data: Book }` (Gutendex DTO mapped to our shape but without `id`/`status` — remote-only) |
| POST | `/api/library/books` | `{ gutendex_id: number }`, header `Idempotency-Key` | 201 envelope `{ data: Book }` |
| GET | `/api/library/books` | `?cursor&limit&status&language&include_deleted` | 200 envelope `{ data: Book[], meta: { count }, links: {...} }` |
| GET | `/api/library/books/:id` | path param | 200 envelope `{ data: Book }` or 404 |
| DELETE | `/api/library/books/:id` | path param | 204 no content |
| POST | `/api/library/books/:id/restore` | path param | 200 envelope `{ data: Book }` |

**Zod schemas** live in `@dialogus/shared/schemas/book.ts` (shared DTO + Gutendex DTO), `@dialogus/shared/schemas/catalog.ts` (search request / response), `@dialogus/shared/schemas/library.ts` (CRUD request / response). Schemas are the contract between api and future web.

**Error envelope (RFC 9457):**

```json
{
  "type": "urn:dialogus:problems:duplicate-gutendex-id",
  "title": "Book already in library",
  "status": 409,
  "detail": "Gutendex ID 996 is already in library as book <uuid>. Use POST /api/library/books/:id/restore if soft-deleted.",
  "instance": "/api/library/books",
  "existing_book_id": "uuid"
}
```

Slugs enumerated in README "API Problems" section: `duplicate-gutendex-id`, `book-not-found`, `gutendex-upstream-error`, `gutendex-validation-failed`, `validation-failed`, `idempotency-key-conflict`, `invalid-cursor`.

## Integration Points

| Service | Purpose | Auth | Retry / error |
|---|---|---|---|
| Gutendex (`https://gutendex.com`) | Book search + metadata | None | 2× exponential retry on 5xx / timeouts; LRU cache 60s; upstream failure → 503 Problem Details `gutendex-upstream-error` with `retry-after: 60` |
| Postgres 18 | `books`, `idempotency_keys` tables | `DATABASE_URL` | `postgres.js` driver default retry on transient; Drizzle errors bubble through `problem` middleware |
| pg-boss | cleanup job `catalog.cleanup-idempotency-keys` (hourly) | Same `DATABASE_URL` | Job retry 3× with 5min backoff; failures logged |

## Impact Analysis

| Component | Impact | Risk | Action |
|---|---|---|---|
| `@dialogus/catalog` | new package | medium (first DDD package) | Build in sequence steps 3-5; m5nita's `domain/pool/` + `infrastructure/persistence/DrizzlePoolRepository` as direct templates |
| `@dialogus/shared/http` | new submodule | low (pure utilities) | Step 1 |
| `@dialogus/shared/schemas/{book,catalog,library}` | new | low | Step 1 |
| `@dialogus/db` schemas + migrations | modified | medium (first production migration over Foundation) | Step 2 |
| `apps/api` middleware (idempotency, problem) | new | medium | Step 6 |
| `apps/api` routes | new | medium (first real route surface) | Steps 7-8 |
| `apps/api` jobs | new | low | Step 10 |
| `apps/web` landing | modified | low (adds one field to status line) | Step 9 |

## Testing Approach

### Unit Tests

- **`@dialogus/catalog` use cases**: inject mock `BookRepository` and mock `GutendexClient`; assert orchestration logic, error mapping, return shapes.
- **`GutendexHttpClient`** via MSW: fixture for `search`, `getBook`, 404, 5xx, validation-failure; assert cache hits on repeat, TTL respected.
- **`DrizzleBookRepository` mapper**: convert domain entity to row and back without loss; assert tag default `[]`, `deleted_at` handling.
- **Shared utilities** (`envelope`, `problemDetails`, `encodeCursor`, `decodeCursor`): pure functions; round-trip cursor tests.
- **Idempotency middleware**: mocked DB; cache-hit returns stored response; hash-mismatch returns 422; miss proceeds then stores.
- **Problem middleware**: `DialogusError` subclasses → Problem Details shape; unknown error → 500 with generic slug + opaque detail (no stack traces leaked).

Target: ≥ 80 % coverage on `@dialogus/catalog` and `@dialogus/shared/http`.

### Integration Tests

- **First use of Testcontainers** in the project. `@testcontainers/postgresql` 11+ spins a fresh Postgres 18 + pgvector per suite.
- **Suite structure**:
  - `migration.integration.test.ts` — apply Foundation's `0000_init` + catalog's `0001_books` + `0002_idempotency_keys` on a fresh container; assert extensions + tables + indexes exist.
  - `library.integration.test.ts` — full happy-path sequence: POST book → GET list returns it → GET :id returns it → DELETE → GET list excludes it → GET :id still returns (with `deleted_at`) → POST /restore → GET list includes again.
  - `idempotency.integration.test.ts` — POST with key X → POST same request same key → same response; POST different body same key → 422.
  - `cursor.integration.test.ts` — insert 50 books → paginate in 2 pages via cursor → assert no duplicates, no skips, correct order.
  - `gutendex.integration.test.ts` — MSW fixture for Gutendex, real DB; full `GET /api/catalog/search` + `POST /api/library/books` path.
- Per-suite container boot target < 15 s; each suite < 30 s wall-clock.
- `pnpm test:integration` stays opt-in locally; CI runs it as a dedicated job (new job added to `ci.yml`).

### E2E Tests

Not in Catalog. Deferred to Feature 004.

### Manual Smoke (before closing Catalog)

1. `docker compose up -d && pnpm db:migrate && pnpm dev`.
2. cURL sequence: `GET /api/catalog/search?q=Don+Quixote` → pick an ID → `POST /api/library/books` with Idempotency-Key → `GET /api/library/books` shows 1 book → `DELETE /:id` → `GET /api/library/books?include_deleted=true` shows it with `deleted_at` → `POST /:id/restore` → `GET /api/library/books` shows 1 active.
3. Browser `http://localhost:3000` shows "livros: 1".
4. Add 2 more books (EN + PT) to satisfy PRD exit criteria.
5. Verify CI green after push.

## Development Sequencing

### Build Order

1. **`@dialogus/shared/http` + new Zod schemas** — no deps
   - `src/http/envelope.ts`, `src/http/problem.ts`, `src/http/cursor.ts`.
   - `src/schemas/book.ts`, `src/schemas/catalog.ts`, `src/schemas/library.ts`.
   - Extend barrel + `exports` map.
   - Unit tests for helpers (round-trip cursor, envelope shape, problem shape).

2. **`@dialogus/db` schemas + migrations** — depends on 1
   - `src/schema/books.ts` (Drizzle table).
   - `src/schema/idempotency_keys.ts` (Drizzle table).
   - Extend `schema/index.ts` barrel.
   - `pnpm db:generate` produces `drizzle/0001_books.sql` + `drizzle/0002_idempotency_keys.sql`; commit both.
   - `pnpm db:reset && pnpm db:migrate` applies cleanly against docker-compose Postgres.

3. **`@dialogus/catalog` domain layer** — depends on 1
   - `src/domain/book/Book.ts`, `src/domain/book/BookRepository.port.ts`, `src/domain/book/GutendexClient.port.ts`, `src/domain/book/BookError.ts`.
   - Exhaustive TypeScript types; no runtime code yet except error classes.

4. **`@dialogus/catalog` infrastructure layer** — depends on 2, 3
   - `src/infrastructure/persistence/DrizzleBookRepository.ts` (uses `@dialogus/db` client).
   - `src/infrastructure/persistence/mappers/BookMapper.ts` (Drizzle row ↔ domain Book).
   - `src/infrastructure/external/GutendexHttpClient.ts` (fetch + `lru-cache` + Zod `.strip()`).
   - MSW fixtures in `__fixtures__/gutendex/`.

5. **`@dialogus/catalog` application layer** — depends on 3
   - 7 use-case files in `src/application/`. Each uses injected ports; no framework deps.
   - Unit tests with in-memory port mocks.

6. **`apps/api` middleware** — depends on 1, 2
   - `src/infrastructure/http/middleware/problem.ts` — catches errors, converts to Problem Details via `@dialogus/shared/http`.
   - `src/infrastructure/http/middleware/idempotency.ts` — reads/writes `idempotency_keys` via Drizzle.
   - Unit tests with mocked DB + fake errors.

7. **`apps/api` `/api/catalog/*` routes** — depends on 1, 4, 5, 6
   - `src/infrastructure/http/routes/catalog.ts` — `GET /search`, `GET /books/:gutendex_id`.
   - Request/response validation via `@hono/zod-validator` + schemas from `@dialogus/shared/schemas/catalog`.

8. **`apps/api` `/api/library/*` routes** — depends on 1, 4, 5, 6
   - `src/infrastructure/http/routes/library.ts` — POST, GET list, GET :id, DELETE, POST /:id/restore.
   - Idempotency middleware applied on POST.

9. **`apps/web` landing extension** — depends on 7 or 8 (whichever ships first)
   - `src/lib/health.ts` adds a parallel `fetchLibraryCount()` reading `meta.count` from `GET /api/library/books?limit=1`.
   - `src/app/page.tsx` renders "livros: N" in the existing status line.

10. **`apps/api` pg-boss cleanup job** — depends on 6
    - `src/jobs/cleanup-idempotency-keys.ts` — `DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'`.
    - Registered at boot; pg-boss schedules hourly via `scheduleJob`.

11. **CI: new `integration` job** — depends on 2, 4, 5, 6, 7, 8
    - Extend `.github/workflows/ci.yml` with `integration` job running `pnpm test:integration`; uses services or Docker-in-Docker for Testcontainers.
    - `build` job now depends on `[lint-and-typecheck, test, integration]`.

12. **Manual smoke + closure** — depends on 11
    - Fresh clone → quickstart → cURL sequence → landing count → CI green.
    - Annotate `_prd.md` Exit Criteria section with timestamps + measured values.

### Technical Dependencies

- Foundation (000) is complete (docker-compose, `@dialogus/shared`, `@dialogus/db`, apps/api Hono skeleton, apps/web Next 16 scaffold).
- `lru-cache@^11` added to `@dialogus/catalog/package.json`.
- `@hono/zod-validator` added to `apps/api/package.json`.
- `@testcontainers/postgresql@^11` added to `apps/api/package.json` devDeps.

## Monitoring and Observability

- **Structured logs**: every route adds `trace_id` via a request-id middleware (generated UUID per request, included in every log line). Catalog log fields: `trace_id, method, path, status, duration_ms, book_id?, gutendex_id?`.
- **Gutendex failures**: logged at WARN with upstream status + cache-hit indicator.
- **Idempotency-Key hits/misses**: counted via log lines; simple to grep for analysis.
- **pg-boss job telemetry**: cleanup job logs count of deleted rows per run.
- **No external APM**: pino structured logs only (per product ADR scope).

## Technical Considerations

### Key Decisions

1. **Idempotency-Key in dedicated table** (ADR-003) — `idempotency_keys` schema survives restart; reused by future POST endpoints; hourly pg-boss cleanup. Alternative rejected: in-memory cache (restart loses state; single-user dogfooding pain).
2. **In-memory LRU cache for Gutendex** (ADR-004) — single `lru-cache@11` instance, 60s TTL, 500 entries max. Alternative rejected: Postgres-backed cache table (over-engineering for 60s TTL).
3. **Tuple cursor `{created_at, id}` base64 JSON** (ADR-005) — stable under concurrent inserts, deterministic tie-break. Alternative rejected: UUID-only cursor (UUIDv4 has no temporal order).
4. **`@dialogus/shared/http` as new submodule** — envelope, problemDetails, cursor helpers centralized once. Features 002-004 import from here. Not an ADR because it's a natural extension, not a controversial decision.
5. **`tags` column reserved in V1** — zero API surface, zero cost in Drizzle schema. Avoids a migration when Phase 2 adds tagging UI. PRD Open Question confirmed.
6. **Error `type` URIs use `urn:dialogus:problems:<slug>`** — stable without hosting (no resolvable URL required by RFC 9457). README enumerates all slugs.
7. **Cursor lifetime is unbounded V1** — invalidated only by `db:reset`. Phase 3 (public deploy) revisits with HMAC signing + explicit expiry.
8. **Gutendex response validation uses Zod `.strip()`** — unknown fields silently dropped (tolerant of Gutendex additions); missing required fields throw typed `ValidationError` that becomes `gutendex-validation-failed` Problem Details.
9. **Package hexagon applies inside `@dialogus/catalog`** — `domain/application/infrastructure` layers are package-internal, not app-internal. `apps/api` is the HTTP framing layer only.
10. **Landing count via `GET /api/library/books?limit=1`** — reuses existing endpoint; no dedicated `/count` surface. Web reads `meta.count`.
11. **Precise count on list** — `SELECT COUNT(*)` per list request. Acceptable for single-user < 1000 books; Phase 2 can swap to approximate if scale demands.
12. **Testcontainers first use** — CI introduces an `integration` job; local dev opts in via `pnpm test:integration`; stays out of pre-commit per product ADR-007.

### Known Risks

- **First DDD package boundary slip** — implementer conflates `@dialogus/catalog` layers. **Mitigation**: PR review checklist compares against m5nita's `apps/api/src/domain/pool/` + `infrastructure/persistence/DrizzlePoolRepository` structurally.
- **Idempotency-Key storage bloat** — without cleanup, table grows indefinitely. **Mitigation**: pg-boss hourly job; partial index on `created_at` for fast delete.
- **Gutendex shape drift** — upstream adds/removes fields. **Mitigation**: `.strip()` tolerates additions; missing required fields surface as typed errors, easy to diagnose.
- **Cursor drift on sort change** — future feature changes default sort and breaks old cursors. **Mitigation**: cursors documented as opaque; if sort changes, clients re-paginate from scratch; no migration pain.
- **Testcontainers boot time** — first-run image pulls on Apple Silicon can exceed 60 s. **Mitigation**: image pinned (`pgvector/pgvector:pg18`), pulled once locally; CI uses Docker-in-Docker with caching.
- **Count query performance** — `SELECT COUNT(*) WHERE deleted_at IS NULL` on a 10k-row table is cheap enough; no index tuning V1.

## Architecture Decision Records

- [ADR-001: Two-namespace API shape (catalog + library)](adrs/adr-001.md) — `/api/catalog/*` for Gutendex gateway; `/api/library/*` for local CRUD.
- [ADR-002: Portfolio-grade 2026 API contract](adrs/adr-002.md) — cursor pagination, RFC 9457 Problem Details, envelope, Idempotency-Key, soft-delete with restore.
- [ADR-003: Idempotency-Key stored in dedicated table](adrs/adr-003.md) — reused by future POST endpoints; hourly pg-boss cleanup.
- [ADR-004: In-memory LRU cache for Gutendex responses](adrs/adr-004.md) — `lru-cache@11`, 60s TTL, 500 entries, per-process.
- [ADR-005: Tuple cursor `{created_at, id}` base64 JSON](adrs/adr-005.md) — stable under inserts, deterministic tie-break by id.
