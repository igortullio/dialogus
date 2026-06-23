# Contract: User-Scoped Library & Ingestion Authorization

Every handler derives `userId` from the session and scopes to the user's
`library_entries` over the **shared** `books` corpus. Cross-user direct-id access
returns `book-not-found` (don't leak existence; SC-002). The DTO/envelope shapes
are unchanged from today; only scoping + a few behaviors change.

| Method · Path | Auth | Change vs today | Response | Errors |
|---|---|---|---|---|
| `POST /api/library/books` | session | `addBookToLibrary(userId, gutendexId)`: resolve-or-create shared book, **upsert membership** (insert or clear `deleted_at`). If global status `discovered`, auto-enqueue ingestion with `Idempotency-Key: ingest-{bookId}`. Already-ingested ⇒ instant `ready`, no enqueue (SC-003/004). | `201`/`200` `{ book }` (with derived status) | `validation-failed`; `ingestion-concurrency-limit` (429) |
| `GET /api/library/books` | session | `listLibrary(userId, …)`: JOIN `library_entries` (`deleted_at IS NULL`), order by `added_at`, cursor over `(added_at, entry id)` | `200` envelope (cursor) | — |
| `GET /api/library/books/:id` | session | `getBook(userId, id)`: member-only | `200` `{ book }` | `book-not-found` (incl. cross-user) |
| `DELETE /api/library/books/:id` | session | `removeBook(userId, id)`: set **`library_entries.deleted_at`** only; never touch `books.deleted_at` (FR-013) | `204` | `book-not-found` |
| `POST /api/library/books/:id/restore` | session | `restoreBook(userId, id)`: clear the user's `deleted_at` | `200` `{ book }` | `book-not-found` |
| `POST /api/library/books/:id/ingest` | session | `ingestBook(userId, bookId)`: **membership check** → per-user concurrency check → `discovered`-guard → enqueue | `202` | `book-not-found`; `ingestion-concurrency-limit` (429, `Retry-After`); `ingestion-conflict` |
| `POST /api/library/books/:id/ingest/retry` | session | `retryIngest(userId, bookId)`: membership-gated retry of a failed shared title | `202` | `book-not-found` |
| `GET /api/library/books/:id/ingestion` | session | `getIngestionStatus(userId, bookId)`: membership-gated; don't reveal status of un-added titles (FR-007) | `200` `{ status, progress, … }` | `book-not-found` |
| `GET /api/library/chunks/:id` | session | `getChunk(userId, chunkId)`: authorize the chunk's book is in the user's active library before returning text (FR-008 citation resolution) | `200` `{ chunk }` | `book-not-found` |

## Rules

- **Shared corpus invariants** (FR-010..FR-013): `books`/`chapters`/`chunks` are
  never per-user; only `library_entries` membership is. Removing the last member
  leaves shared content intact.
- **Per-user concurrency cap** (FR-021): before enqueue, count the user's
  non-terminal in-flight ingestions; `>= INGESTION_USER_CONCURRENCY_LIMIT` ⇒ `429
  ingestion-concurrency-limit` + `Retry-After`. Enforced in the API application
  layer (`ingestBook`), never in pg-boss/the worker.
- **Idempotent add**: re-adding a title already active ⇒ no-op success; re-adding a
  user-removed title ⇒ restore; adding a title someone else ingested ⇒ instant
  membership returning `ready`. The old `DuplicateBookError` path is removed.
- **Catalog/Gutendex search** (`/api/catalog`) stays un-scoped discovery but
  still requires a session (FR-001).
