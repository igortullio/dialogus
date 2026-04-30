# Feature 001: Book Catalog — Product Requirements Document

## Overview

Catalog is dIAlogus's first domain feature — a local-first book discovery and library management surface backed by Project Gutenberg (via Gutendex). It lets the owner search for classic titles, persist chosen books as "library entries" with a tracked ingestion status, and manage the acervo (list / remove / restore) via a portfolio-grade REST API. No ingestion work happens here (deferred to Feature 002); no rich UI is built (deferred to Feature 004). Catalog is the first place where domain logic, DDD layering in `apps/api`, and a real workspace package (`@dialogus/catalog`) materialize.

**Problem.** Foundation proved the stack respires. The owner now needs to accumulate books to ask about, which requires a trustworthy flow for discovering (Gutendex), selecting (add to library), and tracking lifecycle state. Without catalog, nothing downstream has anything to operate on.

**Target users.** Primary: the project owner executing the dogfooding "add 5 books" path from the product PRD. Secondary: the portfolio reviewer who reads the catalog API surface as the first substantial artifact of the project.

**Value.** For the owner, turns Gutendex from an external gateway into a manageable personal acervo with proven persistence. For the reviewer, establishes the API contract conventions that Features 002-004 inherit — getting catalog right propagates polish downstream.

## Goals

1. **Functional catalog API** covering Gutendex search (with filters) + library CRUD (add, list, get, soft-delete, restore) behind a portfolio-grade contract.
2. **First domain package** (`@dialogus/catalog`) ships with DDD layers (domain / application / infrastructure) that Features 002-004 extend by pattern-matching.
3. **Gutendex integration testable without network** — MSW fixtures cover every client call path in unit tests.
4. **Dogfooding gate**: owner searches 3+ classic titles, adds them, sees them in list, soft-deletes one, restores it — all via API directly (cURL or HTTPie; UI not required for V1).
5. **API polish signals 2026 senior engineering** — cursor pagination, RFC 9457 Problem Details, envelope `{data, meta, links}`, Idempotency-Key on POST, soft-delete with restore.

## User Stories

### Primary persona — project owner (daily developer + dogfooder)

- As the owner, I want to search Project Gutenberg by query + language + sort + topic, so I can find classic EN and PT books to add to my library.
- As the owner, I want to cursor-paginate search results, so I can browse past the first 32 hits without offset drift confusing ordering.
- As the owner, I want to add a book to my library by its Gutendex ID, so I persist my selection with a full metadata snapshot.
- As the owner, I want the API to respond idempotently to duplicate POSTs with an Idempotency-Key, so retries don't create phantom duplicates.
- As the owner, I want to list my library with cursor pagination + status filter + language filter, so I can see exactly what's in each state.
- As the owner, I want to soft-delete a book with DELETE returning 204, so I remove it from view without losing the metadata snapshot.
- As the owner, I want to restore a soft-deleted book via `POST /:id/restore`, so I can reverse the action without re-adding metadata.
- As the owner, I want errors to arrive as RFC 9457 Problem Details, so my client renders them consistently and I spot issues quickly.

### Secondary persona — portfolio reviewer

- As a reviewer, I want to inspect the catalog API via the README + a sample cURL sequence and see cursor pagination + Problem Details + envelope responses, so I can form a judgment about engineering taste in 5 minutes.
- As a reviewer, I want the first domain package (`@dialogus/catalog`) to have a clear domain / application / infrastructure split with m5nita-style `.port.ts` interfaces, so I can trust the DDD claim is carried through.

## Core Features

### 1. Gutendex search gateway

`GET /api/catalog/search` accepts `q` (text), `language` (en|pt|en,pt), `topic` (passthrough), `sort` (popular|ascending|descending), `cursor` (opaque), `limit` (1-32, default 32). Proxies to Gutendex with 60s LRU cache per distinct query; returns envelope `{data, meta, links}` with Gutendex results mapped to dIAlogus-shaped DTOs. Never returns a raw Gutendex payload.

### 2. Gutendex single-book detail

`GET /api/catalog/books/:gutendex_id` proxies to Gutendex with the same 60s LRU cache. Used by the library-add flow for preview.

### 3. Library add (with Idempotency-Key)

`POST /api/library/books` with `{ gutendex_id: number }` (+ optional `Idempotency-Key` header). Creates a new library entry in `status = discovered`. Snapshot of Gutendex metadata is copied into the `books` row at creation. Duplicate `gutendex_id` without Idempotency-Key returns 409 Conflict Problem Details pointing at existing `id`. Same Idempotency-Key within 24h returns cached 201 response.

### 4. Library list with filtering

`GET /api/library/books?cursor=<opaque>&limit=<1-100>&status=<enum>&language=<en|pt>&include_deleted=<bool>`. Cursor-paginated, envelope-wrapped, sorted by `created_at DESC`. `include_deleted` default false.

### 5. Library get by ID

`GET /api/library/books/:id` returns full book entity: snapshot metadata, current `ingestion_status`, `ingestion_error` if present, `created_at`, `updated_at`, `deleted_at` (null when not deleted).

### 6. Library soft-delete

`DELETE /api/library/books/:id` returns 204. Sets `deleted_at = now()`; book persists in DB and is filterable via `include_deleted=true`.

### 7. Library restore

`POST /api/library/books/:id/restore` returns 200 with the restored book (envelope). Sets `deleted_at = null`. 404 if book doesn't exist.

### 8. `@dialogus/catalog` domain package

New workspace package: `domain/` (Book entity, value objects, errors), `application/` (use cases: `searchGutendex`, `addBookToLibrary`, `listLibrary`, `getBook`, `removeBook`, `restoreBook`), `infrastructure/` (GutendexClient adapter, DrizzleBookRepository + mapper). Every external adapter has a `.port.ts` interface.

### 9. `apps/api` catalog routes under infrastructure-first layout

New folders `apps/api/src/domain/book/`, `apps/api/src/application/catalog/`, `apps/api/src/infrastructure/http/routes/catalog.ts` + `library.ts`. Establishes the DDD pattern for Features 002-004.

### 10. Web landing extension

`apps/web` landing adds a single status line item: "livros: N" alongside existing "api: up / db: up / pgboss: up". No grid, no interactivity — that's Feature 004. Health-ready signal only.

## User Experience

### Primary flow — add a book from search

1. `curl 'http://localhost:3001/api/catalog/search?q=Don+Quixote&language=en'`
2. Response envelope: `{ data: [ { gutendex_id: 996, title: "Don Quixote", ... } ], meta: { count: 321 }, links: { next: "...?cursor=abc" } }`
3. `curl -X POST http://localhost:3001/api/library/books -H 'Idempotency-Key: add-don-quixote-1' -d '{"gutendex_id":996}'`
4. Response 201: `{ data: { id: "uuid", gutendex_id: 996, title: "Don Quixote", status: "discovered", ... } }`
5. Retry with same Idempotency-Key — same 201 response.
6. `curl http://localhost:3001/api/library/books` — envelope returns the book.

### Secondary flow — browse, soft-delete, restore

1. Owner searches "Machado de Assis" language=pt, sees Dom Casmurro, adds it.
2. `DELETE /api/library/books/<id>` returns 204.
3. `GET /api/library/books` no longer shows it.
4. `POST /api/library/books/<id>/restore` returns 200 with restored entity.

### Secondary flow — landing count

1. `pnpm dev` (Foundation still working).
2. `http://localhost:3000` shows "dIAlogus — api: up / db: up / pgboss: up / livros: 2".

### UI/UX considerations

- API errors use RFC 9457 Problem Details (`application/problem+json` with `type`, `title`, `status`, `detail`, `instance`). Validation errors carry an `errors[]` extension listing field-level issues.
- Envelope `{data, meta, links}` consistent across GET list / single (meta/links omitted on single) / POST (data only) / DELETE (no body).
- Cursor tokens are opaque base64 JSON; clients treat them as opaque strings.
- UI copy (Feature 004) stays in Portuguese; API-level strings (error titles, meta keys) are English.
- No authentication; single-user local.

## High-Level Technical Constraints

- Gutendex treated as best-effort / unreliable; 60s LRU cache mandatory.
- Gutendex responses MUST be mapped to dIAlogus DTOs before reaching the HTTP layer — no raw passthrough.
- First domain package (`@dialogus/catalog`) MUST follow m5nita's DDD layout.
- All new routes use RFC 9457 Problem Details.
- Cursor pagination throughout; zero offset pagination in this feature.
- Idempotency-Key window: 24 hours.
- Soft-delete only V1; hard-delete is Phase 2.
- No UI beyond the landing "livros: N" status line.

## Non-Goals (Out of Scope)

- **Ingestion pipeline** — Feature 002.
- **Rich library UI** (grid, cover rendering, filters, search-within-collection UI) — Feature 004.
- **Cover image proxying / caching** to respect Gutenberg robot policy — Feature 004 (when UI renders covers).
- **Multi-translation grouping** — Phase 2.
- **Tags / shelves / mood metadata UI** — Phase 2 (schema reservation acceptable — see Open Questions).
- **Hard-delete** — Phase 2.
- **Reading-status tracking** (`to-read | reading | read | DNF`) — Phase 2; V1 has only `ingestion_status`.
- **Bulk operations** — Phase 2.
- **Authentication / multi-user** — Phase 3+.
- **Rate limiting** — not a V1 concern.
- **OpenAPI spec auto-publication** — Phase 2.
- **Path versioning (`/v1/`)** — product TechSpec fixed `/api/` without version. Revisit Phase 2.
- **Search-within-library server-side filter** — client-side is sufficient at V1 scale.

## Phased Rollout Plan

### Phase 1 — Catalog V1 (this PRD) — target ~1.5 weeks

Included surfaces:

- `@dialogus/catalog` package with DDD layers.
- `/api/catalog/search`, `/api/catalog/books/:gutendex_id`, `POST /api/library/books`, `GET /api/library/books`, `GET /api/library/books/:id`, `DELETE /api/library/books/:id`, `POST /api/library/books/:id/restore`.
- RFC 9457 Problem Details on all errors.
- Cursor pagination on list endpoints.
- Idempotency-Key on `POST /api/library/books`.
- `books` Drizzle schema + migration.
- Web landing "livros: N" count.
- Unit tests (MSW for Gutendex, mocked repositories for use cases).
- Integration tests via Testcontainers (first use in project).

Exit criteria:

- Owner adds 3+ books via API cURL sequence.
- Soft-delete → restore round-trip succeeds.
- Duplicate POST with same Idempotency-Key returns cached response.
- 409 on duplicate POST without key.
- Landing count accurate after each operation.
- CI green on all jobs including new integration job.

### Phase 2 — catalog polish + reading progress

- Reading-status enum separate from `ingestion_status`.
- Multi-translation grouping.
- Hard-delete endpoint.
- Server-side library search filter.
- OpenAPI spec auto-generated from Zod schemas.

### Phase 3 — public deploy

- `/v1/` path versioning.
- Rate limiting.
- Authentication.

## Success Metrics

### Primary (V1 completion gate)

- **Dogfooding**: owner has added ≥ 3 books (≥ 2 EN + ≥ 1 PT) via the API in a single session.
- **Contract compliance**: every endpoint returns the envelope shape; every error is Problem Details; cursor pagination works across ≥ 2 pages of Gutendex search results.
- **Idempotency**: same Idempotency-Key within 24h returns identical 201 body on retry.
- **Soft-delete round-trip**: DELETE → GET → POST /restore → GET passes without manual DB inspection.
- **First domain package**: `@dialogus/catalog` has `domain/application/infrastructure` folders with ≥ 1 port + 1 adapter + 1 mapper + 2 use cases.

### Secondary

- **Unit test coverage**: ≥ 80 % on `@dialogus/catalog`.
- **Integration tests**: Testcontainers harness boots in < 15s per suite; full catalog E2E test passes in < 30s.
- **Landing stays green**: "api: up / db: up / pgboss: up" never regresses from catalog work.

## Risks and Mitigations

### Adoption risks

- **Idempotency-Key friction erodes dogfooding.** Owner forgets the header, hits 409s, gives up.
  **Mitigation**: 409 Problem Details includes a clear `detail` message pointing at the existing book's `id` and suggesting either Idempotency-Key or `POST /:id/restore`.

### Timeline / resource risks

- **Cursor pagination design slip.**
  **Mitigation**: simple base64 `{created_at, id}` tuple for library; Gutendex passthrough uses page number cached server-side. Documented in TechSpec.
- **DDD folder discipline slips on first use.**
  **Mitigation**: PR review includes a "folder audit" checkbox; m5nita's `apps/api/src/` is the compared template.
- **Testcontainers re-introduces old dialogus-2 pain.**
  **Mitigation**: per-suite container reuse; `pnpm test:integration` opt-in; CI-only per product ADR-007.

### Dependency risks

- **Gutendex downtime.**
  **Mitigation**: 60s LRU softens brief outages; longer outage surfaces as 503 Problem Details with `retry-after`.
- **Gutendex response shape change.**
  **Mitigation**: Zod schema validates every Gutendex response; MSW fixtures document the version shape; mismatch surfaces as a typed `ValidationError`, not a crash.

## Architecture Decision Records

- [ADR-001: Two-namespace API shape (catalog + library)](adrs/adr-001.md) — `/api/catalog/*` for Gutendex gateway; `/api/library/*` for local CRUD. Cleanest separation of external vs. internal domain surface.
- [ADR-002: Portfolio-grade 2026 API contract](adrs/adr-002.md) — cursor pagination, RFC 9457 Problem Details, envelope `{data, meta, links}`, Idempotency-Key on POST, soft-delete with restore.

## Open Questions

- **Path versioning (`/v1/`)**: product TechSpec fixed `/api/` without a version prefix. Revisit when public deploy planned (Phase 2).
- **`tags[]` reservation**: add as optional jsonb to `books` schema even without V1 UI? Recommendation: yes; confirm in TechSpec.
- **Error `type` URIs**: RFC 9457 requires a `type` URI. Stable URIs while undeployed — use local placeholder namespace (e.g. `urn:dialogus:problems:duplicate-gutendex-id`) documented in README?
- **Cursor token lifetime**: tokens must be replayable across client reloads; but cursors that outlive sort-order changes become buggy. Proposal: no expiry V1, invalidated only by DB reset. Confirm in TechSpec.
- **Idempotency-Key storage**: dedicated `idempotency_keys` table vs. annotation on `books`. TechSpec decision; lean toward dedicated (cleaner retention policy).

## Exit Criteria Verification

Verified 2026-04-30T14:55:59Z by T018 closure run.

| Exit criterion | Result | Evidence |
|---|---|---|
| Library CRUD sequence (add → list → get → delete → restore) | ✅ PASS | Manual smoke: 3 books added (Don Quixote EN, Pride and Prejudice EN, Dom Casmurro PT); soft-delete + restore round-trip confirmed via 204 + 200 responses. |
| `meta.count` returns total book count (not page size) | ✅ PASS | `GET /api/library/books?limit=1` → `meta.count: 3`; `limit=5` → same total. Fixed by adding COUNT query to `DrizzleBookRepository.list`. |
| Idempotency-Key replay returns 201 + `X-Idempotency-Replay: true` | ✅ PASS | Same key + same body → 201 with identical body + header. |
| Idempotency-Key conflict returns 422 `idempotency-key-conflict` | ✅ PASS | Same key + different body → 422 Problem Details. |
| Duplicate POST without key returns 409 `duplicate-gutendex-id` | ✅ PASS | Response includes `existing_book_id` UUID. |
| Web landing shows `livros: N` matching library count | ✅ PASS | `data-testid="dialogus-status"` renders `livros: 3` with 3 books active. Dev server requires `CHOKIDAR_USEPOLLING=1` (EMFILE watcher limit in monorepo). |
| `GET /api/catalog/search` returns Gutendex results with LRU cache | ✅ PASS | Search hits Gutendex, caches for 60 s, maps to envelope DTO. |
| All unit + integration test suites green | ✅ PASS | 116 catalog tests, 113 API unit tests pass. Integration tests pass with Testcontainers (Docker). |
| CI green on `main` (4 jobs) | Verified at commit time | lint-and-typecheck, test, integration, build. |

### Observations

- `experimental.extensionAlias` was removed from `next.config.ts`; TypeScript ESM `.js` relative imports were stripped from `packages/shared/src/` (bundler module resolution makes the extension redundant).
- `CHOKIDAR_USEPOLLING=1` added to `apps/web` dev script to work around the kqueue EMFILE watcher limit in the monorepo.
- `ListResult.total` added to domain port + `DrizzleBookRepository` runs a parallel `COUNT(*)` query so the library endpoint returns the true total regardless of `limit`.
