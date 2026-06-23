# ADR-002: The `/api/auth/*` group is exempt from the RFC 9457 problem+json contract (deviation E1)

## Status

Accepted

## Date

2026-06-23

## Context

Constitution Principle III requires every app HTTP error to be RFC 9457
`application/problem+json` with a documented `urn:dialogus:problems:<slug>` type.
The API enforces this with `createProblemMiddleware`, which maps thrown
`DialogusError`s to problem bodies.

Better Auth is mounted as a catch-all on the Hono API
(`app.on(['POST','GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))`). It
returns **its own** `Response` objects with **its own** JSON error shape
(`{ message, code, ... }`), which the Better Auth client/SDK expects verbatim.
Forcing those through `createProblemMiddleware` would rewrite the bodies and
break the protocol the client library parses.

## Decision

**Exempt the `/api/auth/*` group from the RFC 9457 problem+json contract.**

- Better Auth returns `Response` objects and never throws into the Hono chain, so
  the global problem middleware passes them through untouched.
- The app's **own** endpoints (`/api/library`, `/api/preferences`,
  `/api/admin`, `/api/invitations`, …) remain fully RFC 9457-compliant, and new
  app error slugs were added for this feature (`unauthorized`, `forbidden`,
  `rate-limited`, `invitation-invalid`, `invitation-conflict`, `last-admin`,
  `member-not-found`, …).
- Only the third-party auth group is exempt; the exemption is bounded to that
  prefix.

## Alternatives Considered

### Re-wrap Better Auth errors as problem+json

- **Description**: intercept Better Auth's responses and translate them into the
  RFC 9457 shape (status + `urn:dialogus:problems:<slug>` type).
- **Cons**: the Better Auth client library parses Better Auth's native error
  shape (`code`/`message`) to drive flows (e.g. distinguishing invalid-credentials
  from rate-limited); rewriting every auth response would break the SDK contract,
  require maintaining a mapping for every Better Auth error code, and re-wrap
  success responses too (cookies, redirects).
- **Why rejected**: corrupts the auth protocol for no real benefit — the consumer
  of these errors is the auth client, not a generic API consumer.

## Consequences

- A small, explicit hole in the otherwise-uniform error contract, documented here
  and in `plan.md` Complexity Tracking (E1).
- App code that calls Better Auth server APIs and lets its `APIError` escape into
  an app route (e.g. the accept-invite flow) maps that `APIError` to a proper app
  problem slug at the route boundary, keeping app endpoints compliant.
