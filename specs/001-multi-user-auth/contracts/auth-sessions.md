# Contract: Authentication & Sessions (Better Auth)

Mounted on the Hono API as a catch-all: `app.on(['POST','GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))`.
This group is **exempt** from problem+json remapping (exception E1) — it returns
Better Auth's native JSON errors. Configuration enforces invite-only
(`disableSignUp: true` + `user.create.before` hook), `text` user IDs, DB-backed
rate limiting, the admin plugin (roles + ban/revoke), and `SameSite=Lax; Secure;
HttpOnly` cookies.

## Endpoints (Better Auth-provided)

| Method · Path | Auth | Purpose | Notes |
|---|---|---|---|
| `POST /api/auth/sign-up/email` | invite-gated | Create account for an authorized email | Hook rejects non-allowlisted emails → records `unauthorized_signup_attempt`, returns invite-invalid; on success marks invitation `used` (FR-014/016) |
| `POST /api/auth/sign-in/email` | public | Email+password sign-in → session cookie | Rate-limited (e.g. 5/60s); failures logged `sign_in_failed` (FR-021) |
| `POST /api/auth/sign-out` | session | End the session on this device (FR-004) | |
| `GET /api/auth/get-session` | cookie | Return `{ user, session }` or null | Used by Next middleware/SSR after forwarding the inbound `Cookie` |
| `POST /api/auth/request-password-reset` | public | Email a single-use, time-limited reset link | Sent via the internal `sendEmail()` port (FR-019); rate-limited |
| `POST /api/auth/reset-password` | reset token | `{ token, newPassword }` → set new password | Token consumed from `verification` |

## Session object (shape)

```
session: { id, userId, token, expiresAt, ipAddress, userAgent }
user:    { id, email, name, role: 'admin' | 'member', banned }
```

## Behaviors

- **Expiry** (FR-018): inactivity + max age from `SESSION_MAX_AGE_SECONDS`;
  expired session ⇒ `get-session` null ⇒ web redirects to `/sign-in`, preserving
  the return path so the user lands back where they were.
- **Multi-device** (FR-020): independent `session` rows; signing out one device
  does not invalidate the others.
- **Revocation** (FR-015): admin ban deletes the user's sessions; next request is
  unauthenticated.
- **Rate limiting** (FR-021): `429` `urn:dialogus:problems:rate-limited` with
  `Retry-After` (or Better Auth's native equivalent on the `/api/auth/*` group).
