# API Contracts: Multi-User Accounts & Per-User Data Isolation

These are contract sketches (method · path · auth · request · response · errors)
for the endpoints this feature adds or changes. They are intentionally not full
OpenAPI; the authoritative request/response shapes are the Zod schemas in
`@dialogus/shared` plus the Better Auth handler.

## Conventions (carried from the existing API)

- **Auth**: every endpoint except the Better Auth `/api/auth/*` group requires an
  authenticated session (HttpOnly cookie). The user identity is derived from the
  session **server-side** — never from a request body or query param (SC-002).
  Unauthenticated requests get `401`; the web tier redirects to `/sign-in`.
- **Errors**: app endpoints return RFC 9457 `application/problem+json` with a
  `urn:dialogus:problems:<slug>` type. The Better Auth `/api/auth/*` group is
  **exempt** and emits Better Auth's own JSON error format (exception E1).
- **Lists**: cursor pagination + Zod-typed envelopes (`envelope(data, { meta, links })`),
  unchanged from today.
- **Cookies**: `SameSite=Lax; Secure; HttpOnly` under the recommended single-origin
  deployment.

## New / changed problem slugs

| Slug | Status | Meaning |
|------|--------|---------|
| `urn:dialogus:problems:unauthorized` | 401 | No / invalid session |
| `urn:dialogus:problems:forbidden` | 403 | Authenticated but not allowed (e.g. non-admin) |
| `urn:dialogus:problems:invitation-invalid` | 409/410 | Invite missing, used, expired, or revoked |
| `urn:dialogus:problems:rate-limited` | 429 | Auth-abuse limit hit (`Retry-After`) |
| `urn:dialogus:problems:ingestion-concurrency-limit` | 429 | Per-user in-flight ingestion cap hit (`Retry-After`) |
| `urn:dialogus:problems:book-not-found` | 404 | Reused for cross-user direct-id access (don't leak existence) |
| `urn:dialogus:problems:last-admin` | 409 | Refused: would remove the only administrator |

## Files

- [`auth-sessions.md`](./auth-sessions.md) — Better Auth endpoints + session/reset
- [`admin-invitations.md`](./admin-invitations.md) — owner allowlist & access control
- [`library.md`](./library.md) — user-scoped library + ingestion authorization
- [`preferences.md`](./preferences.md) — account-scoped spoiler caps
- [`threads.md`](./threads.md) — authenticated thread proxy + isolation contract
