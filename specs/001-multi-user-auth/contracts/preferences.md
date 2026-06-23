# Contract: Account-Scoped Preferences (Spoiler Caps)

Replaces the per-device `localStorage` spoiler caps with account-scoped storage
(`user_book_preferences`) so caps follow the user across devices (FR-008, FR-009,
SC-008). `userId` comes from the session — never the body. Reuses the
`spoiler_caps` map shape from `packages/shared/src/schemas/chat.ts`
(`z.record(z.uuid(), z.number().int().min(0))`).

| Method · Path | Auth | Request | Response | Errors |
|---|---|---|---|---|
| `GET /api/preferences/spoiler-caps` | session | `?book_ids=<uuid,uuid,…>` (the thread's current books) | `200` envelope: `{ caps: { <bookId>: <ordinal>\|null } }` | `validation-failed` |
| `PUT /api/preferences/spoiler-caps/:bookId` | session | `{ spoiler_cap_chapter: number \| null }` | `200` `{ bookId, spoiler_cap_chapter }` (upsert) | `validation-failed`; `book-not-found` |

## Rules

- **Semantics**: `spoiler_cap_chapter = NULL` ⇒ no cap (unbounded), matching
  today's "absent key = no cap". A non-null integer hides chapters with
  `ordinal > value`. `null` (clear) is distinct from `0` (hide everything).
- **Per-book, account-scoped** (not per-thread): a cap set for a book applies to
  all of that user's threads using that book (FR-008).
- **Enforcement unchanged**: the cap reaches retrieval through the existing
  `spoiler_caps` → tool-arg → SQL clause (`DialogusChunkReadAdapter.spoilerCapClause`,
  filtered in SQL per Principle IV). Only the **source** of the map changes from
  localStorage to this API.
- **Hardening (recommended, in scope)**: inject the authenticated user's caps into
  retrieval **structurally** server-side (via the Mastra proxy `requestContext` /
  tool default args) so the SQL cap cannot be silently bypassed by a
  non-compliant model. See `threads.md` and research Area 5.
- **No migration** (FR-022): existing localStorage caps are not migrated
  server-side; an optional one-time client upload-then-clear is allowed.
