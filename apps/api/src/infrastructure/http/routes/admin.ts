import { ForbiddenError, UnauthorizedError } from '@dialogus/shared/errors'
import { decodeCursor, encodeCursor } from '@dialogus/shared/http/cursor'
import { envelope } from '@dialogus/shared/http/envelope'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import {
  createInvitation,
  type InvitationServiceDeps,
  listInvitations,
  revokeInvitation,
} from '../../../application/admin/invitations'
import {
  type DeleteAccountDeps,
  deleteAccount,
  listMembers,
  type MembersDeps,
  restoreMember,
  revokeMember,
  setMemberRole,
} from '../../../application/admin/members'
import type {
  AdminRepository,
  InvitationRecord,
  InvitationStatus,
  MemberRecord,
  UserThreadDeleter,
} from '../../../application/admin/ports'
import type { Auth } from '../../auth/auth'
import type { EmailProvider } from '../../email'
import { type AuthVariables, createSessionMiddleware, requireAdmin } from '../middleware/auth'

export interface AdminRouteDeps {
  readonly auth: Auth
  readonly repo: AdminRepository
  readonly email: EmailProvider
  readonly appUrl: string
  readonly threads: UserThreadDeleter
}

const invitationStatusEnum = z.enum(['pending', 'used', 'expired', 'revoked'])

const createInvitationRequestSchema = z.object({
  email: z.email(),
  expires_in_hours: z.number().int().min(1).max(8760).optional(),
})

const listQuerySchema = z.object({
  status: invitationStatusEnum.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const setRoleRequestSchema = z.object({ role: z.enum(['admin', 'member']) })

const invitationIdParamSchema = z.object({ id: z.uuid() })
const memberIdParamSchema = z.object({ id: z.string().min(1) })

function toInvitationDto(inv: InvitationRecord) {
  return {
    id: inv.id,
    email: inv.email,
    status: inv.status,
    invited_by: inv.invitedBy,
    consumed_by_user_id: inv.consumedByUserId,
    expires_at: inv.expiresAt.toISOString(),
    created_at: inv.createdAt.toISOString(),
    updated_at: inv.updatedAt.toISOString(),
  }
}

function toMemberDto(member: MemberRecord) {
  return {
    id: member.id,
    email: member.email,
    role: member.role,
    banned: member.banned,
    created_at: member.createdAt.toISOString(),
  }
}

function userIdOf(c: Context<{ Variables: AuthVariables }>): string {
  const userId = c.get('userId')
  if (userId === null) throw new UnauthorizedError()
  return userId
}

function nextLinks(
  path: string,
  limit: number,
  nextCursor: { createdAt: Date; id: string } | null,
  extra: Record<string, string | undefined> = {},
) {
  const links: Record<string, string> = { self: path }
  if (nextCursor !== null) {
    const params = new URLSearchParams({ cursor: encodeCursor(nextCursor), limit: String(limit) })
    // Carry filters (e.g. ?status=) into the next page so pagination stays scoped.
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) params.set(key, value)
    }
    links.next = `${path}?${params.toString()}`
  }
  return links
}

/**
 * Owner/admin onboarding + access-control endpoints (US3). All routes are gated
 * by `requireAdmin` (401 if unauthenticated, 403 otherwise). Mutations flow
 * through the application services, which own the invitation state machine and
 * the last-admin safeguard; errors surface as RFC 9457 problem+json.
 */
export function createAdminRoute(deps: AdminRouteDeps): Hono {
  const app = new Hono<{ Variables: AuthVariables }>()

  app.use('*', createSessionMiddleware(deps.auth))
  app.use('*', requireAdmin())

  const invitationDeps: InvitationServiceDeps = {
    repo: deps.repo,
    email: deps.email,
    appUrl: deps.appUrl,
  }
  const membersDeps: MembersDeps = { repo: deps.repo }
  const deleteDeps: DeleteAccountDeps = { repo: deps.repo, threads: deps.threads }

  app.post('/invitations', async (c) => {
    const invitedBy = userIdOf(c)
    const body = createInvitationRequestSchema.parse(await c.req.json())
    const invitation = await createInvitation(invitationDeps, {
      email: body.email,
      invitedBy,
      ...(body.expires_in_hours !== undefined ? { expiresInHours: body.expires_in_hours } : {}),
    })
    return c.json(envelope(toInvitationDto(invitation)), 201)
  })

  app.get('/invitations', async (c) => {
    const query = listQuerySchema.parse(c.req.query())
    const page = await listInvitations(invitationDeps, {
      ...(query.status ? { status: query.status as InvitationStatus } : {}),
      ...(query.cursor ? { cursor: decodeCursor(query.cursor) } : {}),
      limit: query.limit,
    })
    return c.json(
      envelope(page.items.map(toInvitationDto), {
        meta: { count: page.items.length },
        links: nextLinks(c.req.path, query.limit, page.nextCursor, { status: query.status }),
      }),
      200,
    )
  })

  app.delete('/invitations/:id', async (c) => {
    const { id } = invitationIdParamSchema.parse(c.req.param())
    await revokeInvitation(invitationDeps, id)
    return new Response(null, { status: 204 })
  })

  app.get('/members', async (c) => {
    const query = listQuerySchema.parse(c.req.query())
    const page = await listMembers(membersDeps, {
      ...(query.cursor ? { cursor: decodeCursor(query.cursor) } : {}),
      limit: query.limit,
    })
    return c.json(
      envelope(page.items.map(toMemberDto), {
        meta: { count: page.items.length },
        links: nextLinks(c.req.path, query.limit, page.nextCursor),
      }),
      200,
    )
  })

  app.post('/members/:id/revoke', async (c) => {
    const actorId = userIdOf(c)
    const { id } = memberIdParamSchema.parse(c.req.param())
    const member = await revokeMember(membersDeps, id, { actorId })
    return c.json(envelope(toMemberDto(member)), 200)
  })

  app.post('/members/:id/restore', async (c) => {
    const { id } = memberIdParamSchema.parse(c.req.param())
    const member = await restoreMember(membersDeps, id)
    return c.json(envelope(toMemberDto(member)), 200)
  })

  app.post('/members/:id/role', async (c) => {
    const { id } = memberIdParamSchema.parse(c.req.param())
    const { role } = setRoleRequestSchema.parse(await c.req.json())
    const member = await setMemberRole(membersDeps, id, role)
    return c.json(envelope(toMemberDto(member)), 200)
  })

  app.delete('/members/:id', async (c) => {
    const actorId = userIdOf(c)
    const { id } = memberIdParamSchema.parse(c.req.param())
    // Guard against self-erasure from the admin console (a destructive footgun
    // distinct from the last-admin safeguard). Self-service deletion, if ever
    // wanted, belongs in a dedicated account-settings flow.
    if (id === actorId) {
      throw new ForbiddenError('You cannot delete your own account from the admin console')
    }
    await deleteAccount(deleteDeps, id)
    return new Response(null, { status: 204 })
  })

  return app as unknown as Hono
}
