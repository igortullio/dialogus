import { envelope } from '@dialogus/shared/http/envelope'
import { APIError } from 'better-auth/api'
import { Hono } from 'hono'
import { z } from 'zod'
import { InvitationInvalidError } from '../../../application/admin/errors'
import { acceptInvitation } from '../../../application/admin/invitations'
import type { AdminRepository } from '../../../application/admin/ports'

export interface InvitationsRouteDeps {
  readonly repo: AdminRepository
  /** Provisions the member account (mirrors the owner seed); consumes the invite via the auth hooks. */
  readonly createAccount: (input: {
    email: string
    name: string
    password: string
  }) => Promise<{ id: string }>
}

const idParamSchema = z.object({ id: z.uuid() })

const acceptRequestSchema = z.object({
  invitation: z.uuid(),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
})

/**
 * Public (unauthenticated) invitation surface used by the accept-invite page.
 * The invitation id doubles as the unguessable accept token (uuid v4). `GET`
 * exposes the invited email so the page can confirm the link; `POST /accept`
 * provisions the account. Both reject non-open invitations with
 * `invitation-invalid` (410) — single-use + expiry (FR-016).
 */
export function createInvitationsRoute(deps: InvitationsRouteDeps): Hono {
  const app = new Hono()

  app.get('/:id', async (c) => {
    const { id } = idParamSchema.parse(c.req.param())
    const invitation = await deps.repo.findInvitationById(id)
    if (
      !invitation ||
      invitation.status !== 'pending' ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw new InvitationInvalidError()
    }
    return c.json(envelope({ email: invitation.email, status: invitation.status }), 200)
  })

  app.post('/accept', async (c) => {
    const body = acceptRequestSchema.parse(await c.req.json())
    try {
      const { userId } = await acceptInvitation(
        { repo: deps.repo, createAccount: deps.createAccount },
        { invitationId: body.invitation, name: body.name, password: body.password },
      )
      return c.json(envelope({ user_id: userId }), 201)
    } catch (error) {
      // Race: the invite was consumed/revoked between validation and account
      // creation, so the allowlist hook rejected with a Better Auth APIError —
      // surface it as `invitation-invalid` (410) instead of a generic 500.
      if (error instanceof APIError) throw new InvitationInvalidError()
      throw error
    }
  })

  return app
}
