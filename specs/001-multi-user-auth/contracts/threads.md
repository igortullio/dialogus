# Contract: Authenticated Thread Proxy & Conversation Isolation

> **Fixes a live leak**: today `listThreads` calls Mastra with no `resourceId`
> (returns all users' threads) and the browser calls Mastra directly via the
> public `NEXT_PUBLIC_MASTRA_URL` with no auth. This contract closes both.

## Boundary

- The **browser never calls Mastra directly**. All thread operations go through an
  **authenticated server boundary** (Next route handlers under
  `apps/web/src/app/api/…`, the existing `stream` proxy pattern extended to
  list/get/patch/delete/messages), which reads the Better Auth session, derives
  `userId`, and forwards a **verifiable credential** to Mastra.
- **Mastra `server.auth`** verifies that credential and sets
  `resourceId = userId` server-side (`getEffectiveResourceId`); its built-in
  ownership checks then `404` any `resourceId` mismatch. Client-supplied
  `memory.resource` is never trusted. `resourceId` is immutable after thread
  creation.

## Operations (via the authenticated proxy)

| Operation | Scoping | Isolation guarantee |
|---|---|---|
| List threads | `resourceId = userId` (sent + enforced) | User sees only their own threads (FR-006) |
| Get / stream a thread | ownership check on `resourceId` | Cross-user/direct-id access ⇒ `404` |
| Rename / pin (metadata) | writes `mastra_threads.metadata` for the owned thread | Titles/pins are per-user (in metadata) |
| Delete a thread | ownership check | A user can only delete their own (FR-006) |
| Chat stream | `memory.resource = userId` injected server-side; caps injected structurally | Messages persist under the owner's `resourceId` |

## Client cache isolation

- Scope `THREADS_QUERY_KEY` / thread-metadata query keys by `userId`, or clear the
  React Query cache + SSR-prefetched threads on sign-out / user switch, so User B
  never sees User A's cached threads on a shared browser.

## Account deletion (FR-023)

- Deleting a user removes their threads/messages/working-memory by `resourceId`
  via Mastra's delete APIs (no DB cascade across the Mastra boundary). The shared
  corpus is untouched.

## Notes

- Mastra's native `401/404` responses are not problem+json; if surfaced through
  `apps/api` they are normalized to `urn:dialogus:problems:<slug>`
  (`unauthorized` / `book-not-found`-style). The Mastra auth secret is added to the
  `@dialogus/shared` Zod env schema.
