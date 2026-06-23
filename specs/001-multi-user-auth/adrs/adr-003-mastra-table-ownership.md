# ADR-003: Mastra-owned thread tables stay framework-managed; the user link is logical (deviation E2)

## Status

Accepted

## Date

2026-06-23

## Context

A constitution tech constraint requires all schema to be authored as Drizzle
migrations under `packages/db/drizzle` (one migration authority). Per-user
conversation isolation requires associating Mastra Memory **threads** with the
authenticated user.

Mastra's Memory tables — `mastra_threads`, `mastra_messages`, `mastra_resources`
— are **framework-managed**: their names are hardcoded and they are auto-created
and migrated by `PostgresStore.init()`; only `schemaName` is configurable. They
cannot be expressed as Drizzle migrations without fighting the framework and
drifting from what Mastra actually creates.

## Decision

**Leave the Mastra tables framework-owned (not Drizzle-migrated); scope threads
to users with a logical link, not a DB foreign key.**

- Per-user scoping sets `mastra_threads.resourceId = user.id` (immutable after
  creation). The web tier injects `resourceId` server-side from the session, so a
  client can never read or write another user's threads.
- There is **no DB foreign key** crossing the Drizzle/Mastra boundary. App-owned
  per-user tables (`library_entries`, `user_book_preferences`, `security_events`,
  `invitations`) remain Drizzle-authored with FKs to `user`.
- **Account deletion (FR-023)** therefore cannot cascade Mastra threads via the
  DB. Instead, `deleteAccount` removes the user's threads through Mastra's HTTP
  API by `resourceId` (`MastraThreadDeleter`) **before** deleting the `user` row,
  whose FKs cascade the app-owned per-user data and SET NULL the audit /
  invitation references.

## Alternatives Considered

### Hand-author Drizzle migrations for the Mastra tables

- **Description**: transcribe `mastra_threads`/`messages`/`resources` into Drizzle
  schema and migrate them ourselves, adding a real FK `resourceId → user.id`.
- **Cons**: the names/shape are owned by Mastra and change with framework
  upgrades; `PostgresStore.init()` would still try to create/alter them, causing
  drift and init conflicts; a hard FK would couple framework-managed rows to our
  migration lifecycle.
- **Why rejected**: fights the framework and creates a second, invisible source of
  truth for those tables.

## Consequences

- A bounded, documented deviation (E2 in `plan.md`): app-owned tables are Drizzle,
  framework tables are not.
- Account deletion is a two-step operation (Mastra API delete, then DB delete);
  the integration test asserts the shared corpus and other users are untouched.
- If the Mastra thread delete fails, the user row is not deleted (no partial
  cleanup), so the operation can be retried.
