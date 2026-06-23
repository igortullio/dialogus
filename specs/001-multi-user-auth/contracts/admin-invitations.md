# Contract: Owner Access Control (Invitations / Allowlist)

Owner/admin-only endpoints to authorize who may create an account and to revoke
access. All require `role = admin` (else `403 forbidden`). Mutations write a
`security_events` row.

| Method · Path | Auth | Request | Response | Errors |
|---|---|---|---|---|
| `POST /api/admin/invitations` | admin | `{ email, expiresInHours? }` | `201` `{ invitation }` (`pending`) | `forbidden`; `validation-failed`; conflict if a live invite/account already exists for the email |
| `GET /api/admin/invitations` | admin | `?status=&cursor=&limit=` | `200` envelope of `invitations` (cursor) | `forbidden` |
| `DELETE /api/admin/invitations/:id` | admin | — | `204` (status → `revoked`) | `forbidden`; `invitation-invalid` if not `pending` |
| `GET /api/admin/members` | admin | `?cursor=&limit=` | `200` envelope of `{ id, email, role, banned, createdAt }` | `forbidden` |
| `POST /api/admin/members/:id/revoke` | admin | — | `200` `{ member }` (banned; sessions invalidated) | `forbidden`; `last-admin` if target is the only admin (FR-017) |
| `POST /api/admin/members/:id/restore` | admin | — | `200` `{ member }` (unbanned) | `forbidden` |
| `POST /api/admin/members/:id/role` | admin | `{ role: 'admin'\|'member' }` | `200` `{ member }` | `forbidden`; `last-admin` if demoting the only admin |

## Rules

- **Single-use** (FR-016): an invitation is consumed exactly once (`pending → used`)
  by the sign-up hook; reusing a non-`pending` invite ⇒ `invitation-invalid`.
- **Revoke = ban** (FR-015): sets `user.banned`, deletes sessions; the member can
  no longer sign in or reach any data on the next request (SC-007).
- **Last-admin safeguard** (FR-017): revoking or demoting the only admin is
  refused with `last-admin`.
- Member/invitation list endpoints follow the cursor + Zod-envelope convention.

> **Bootstrap**: the first owner account is created out-of-band (a one-off seed /
> admin-create script using Better Auth's server-side `createUser`), since
> invite-only blocks self-service. This seed is part of deployment setup, invoked
> manually — see `quickstart.md`.
