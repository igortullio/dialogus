# Phase 1 Data Model: Multi-User Accounts & Per-User Data Isolation

**Feature**: `001-multi-user-auth` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

All new state lives in the **single Postgres 18** instance. Tables fall into
three ownership classes:

| Class | Tables | Migration authority |
|-------|--------|---------------------|
| **Better Auth core** | `user`, `session`, `account`, `verification`, `rate_limit` | Authored as Drizzle schema, generated via drizzle-kit → `packages/db/drizzle` |
| **App-owned (new)** | `invitations`, `security_events`, `library_entries`, `user_book_preferences` | Drizzle schema + migrations |
| **Framework-owned (Mastra)** | `mastra_threads`, `mastra_messages`, `mastra_resources` | Not Drizzle-migratable — auto-created by `PostgresStore.init()` (exception E2) |

> **ID convention**: Better Auth uses **`text`** primary keys. Every foreign key
> that references a user is therefore `text`. The existing corpus
> (`books`/`chapters`/`chunks`/`chapter_summaries`) keeps its `uuid` PKs.

---

## 1. Better Auth core tables

### `user`
| Field | Type | Notes |
|-------|------|-------|
| `id` | `text` PK | Better Auth-generated |
| `name` | `text` | |
| `email` | `text` UNIQUE NOT NULL | normalized lowercase |
| `email_verified` | `boolean` | |
| `image` | `text` NULL | |
| `role` | `text` | admin-plugin column; `admin` \| `member` (FR-017) |
| `banned` | `boolean` | admin-plugin; revocation flag (FR-015) |
| `ban_reason` | `text` NULL | |
| `ban_expires` | `timestamptz` NULL | |
| `created_at` / `updated_at` | `timestamptz` | |

**Relationships**: 1→N `session`, `account`, `library_entries`,
`user_book_preferences`, `security_events`; logical 1→N to `mastra_threads`
(`resourceId == user.id`).

### `session`
`id text PK`, `user_id text FK→user ON DELETE CASCADE`, `token text UNIQUE`,
`expires_at timestamptz`, `ip_address text`, `user_agent text`, `created_at`,
`updated_at`. Multi-device (FR-020); deleted on ban/revoke and on
inactivity/max-age expiry (FR-018).

### `account`
`id text PK`, `user_id text FK→user ON DELETE CASCADE`, `account_id text`,
`provider_id text` (`credential` for email+password), `password text` (hashed —
FR-005), `created_at`, `updated_at`.

### `verification`
`id text PK`, `identifier text`, `value text`, `expires_at timestamptz`,
`created_at`, `updated_at`. Backs single-use, time-limited password-reset tokens
(FR-019); consumed on reset.

### `rate_limit`
`id text PK`, `key text` (path/identifier), `count integer`, `last_request bigint`.
Required by `rateLimit.storage:'database'` (FR-021); shared across processes.

---

## 2. App-owned tables

### `invitations` (allowlist) — FR-014, FR-016
| Field | Type | Notes |
|-------|------|-------|
| `id` | `uuid` PK `default uuid_generate_v4()` | |
| `email` | `text` NOT NULL | normalized; unique among non-terminal rows |
| `status` | `text` | `pending` \| `used` \| `expired` \| `revoked` |
| `invited_by` | `text` FK→`user.id` | issuing owner/admin |
| `consumed_by_user_id` | `text` FK→`user.id` NULL | set when an account is created |
| `expires_at` | `timestamptz` | |
| `created_at` / `updated_at` | `timestamptz` | |

**Constraints**: partial `UNIQUE(email) WHERE status = 'pending'` (one live
invite per email). **State machine**: `pending → used` (account created via the
`user.create.before` hook) · `pending → revoked` (owner) · `pending → expired`
(past `expires_at`). Reuse of a non-`pending` row is rejected (FR-016).

### `security_events` (audit) — FR-005
`id uuid PK`, `user_id text FK→user NULL`, `email text NULL`, `event_type text`
(`account_created` \| `sign_in` \| `sign_in_failed` \| `access_revoked` \|
`unauthorized_signup_attempt` \| `rate_limited`), `ip_address text`,
`user_agent text`, `metadata jsonb`, `created_at timestamptz`. Append-only;
`user_id` nullable for anonymous/unauthorized attempts.

### `library_entries` (per-user membership) — FR-007, FR-010..FR-013, FR-021
| Field | Type | Notes |
|-------|------|-------|
| `id` | `uuid` PK | surrogate |
| `user_id` | `text` FK→`user.id` ON DELETE CASCADE | account deletion removes membership (FR-023) |
| `book_id` | `uuid` FK→`books.id` ON DELETE CASCADE | book deletion (rare) removes the entry; **member remove never deletes the book** |
| `added_at` | `timestamptz default now()` | per-user ordering |
| `deleted_at` | `timestamptz` NULL | per-user soft-remove (FR-013) |

**Constraints**: `UNIQUE(user_id, book_id)`. **Indexes**: partial
`(user_id, added_at DESC, id DESC) WHERE deleted_at IS NULL` for cursor
pagination; `(book_id)` for "is any member still referencing this book?" checks.
**Relationships**: N:1 `user`, N:1 `books`. A book has one entry per user who
added it; the shared book/chapters/chunks are never cascaded by a member remove.

### `user_book_preferences` (spoiler caps) — FR-008, FR-009, SC-008
| Field | Type | Notes |
|-------|------|-------|
| `id` | `uuid` PK `default uuid_generate_v4()` | |
| `user_id` | `text` FK→`user.id` ON DELETE CASCADE | (FR-023) |
| `book_id` | `uuid` FK→`books.id` ON DELETE CASCADE | |
| `spoiler_cap_chapter` | `integer` NULL | `NULL` = no cap; chapters with `ordinal > value` are hidden in SQL |
| `created_at` / `updated_at` | `timestamptz` | |

**Constraints**: `UNIQUE(user_id, book_id)` (upsert `ON CONFLICT`). **Index**:
`(user_id)`. Replaces the per-device `localStorage` key. FK cascades clean up on
account deletion / book removal without touching shared content.

---

## 3. Framework-owned (Mastra) — existing, logical link only

`mastra_threads` (`id`, `resourceId`, `title`, `metadata{custom_title,pinned,book_ids}`,
timestamps), `mastra_messages` (`id`, `threadId`, `role`, `content`),
`mastra_resources` (`id`). **Per-user scoping is achieved by setting
`mastra_threads.resourceId = user.id`** (immutable after creation). No DB FK
crosses the Drizzle/Mastra boundary; account deletion removes a user's threads via
Mastra's delete APIs (FR-023), not cascades.

---

## 4. Changed existing tables

- **`books`** — unchanged columns. **Behavioral change**: `books.deleted_at`
  stops being the per-user "removed from library" signal (that moves to
  `library_entries.deleted_at`) and becomes an owner/catalog archival flag only.
  `UNIQUE(gutendex_id)` + global `ingestion_status` keep the corpus shared.
- **`chapters` / `chunks` / `chapter_summaries`** — unchanged; remain global,
  referenced through `library_entries` membership, never per-user.

---

## 5. Derived / invariant rules

- **User-visible ingestion status** = the global `books.ingestion_status` for a
  book the user has in their library. No per-user status column (research Area 3).
- **Instant re-add** (SC-003/SC-004): adding a title whose global status is
  `ready` creates the membership and shows `ready` with **no** enqueue.
- **Exactly-once first ingest** (FR-012): `discovered`-only guard +
  immediate flip to `downloading` + deterministic `Idempotency-Key ingest-{bookId}`.
- **Cross-user access** returns `BookNotFoundError` (don't leak existence; SC-002).
- **Account deletion** (FR-023): cascades remove `session`, `account`,
  `library_entries`, `user_book_preferences`, and anonymize/remove `security_events`;
  Mastra threads are deleted by `resourceId` via Mastra APIs; the shared corpus is
  untouched.
- **Leftover single-user data** (FR-022): pre-existing `books`/threads have no
  `library_entries` and `resourceId='owner'`; no new user maps to `owner`, and no
  code path lists `books` globally — so they never surface to new users.

---

## 6. Migration sequence (dependency-ordered)

| # | Migration | Creates | Built in |
|---|-----------|---------|----------|
| `0008` | `auth_core` | `user`, `session`, `account`, `verification`, `rate_limit` (+ admin-plugin columns on `user`) | Foundational |
| `0009` | `library_entries` | `library_entries` (+ indexes) | US2 (P1) |
| `0010` | `user_book_preferences` | `user_book_preferences` | US2 (P1) |
| `0011` | `invitations_and_security_events` | `invitations`, `security_events` | US3 (P2) |

Numbered in **build/priority order**: `auth_core` is foundational; the per-user
library tables (P1) precede the invitation/audit tables (P2). Both groups depend
only on `auth_core` (users), so the relative order between them is free — it
follows the implementation sequence. All generated via `drizzle-kit` and applied
by `packages/db/src/migrate.ts` (`pnpm db:generate` / `pnpm db:migrate`). The
fixed constraint is only that **users precede any table referencing them**.
