import { z } from 'zod'
import { apiBaseUrl, fetchEnvelope, fetchVoid, nextCursorFromLinks } from './_envelope'

const ADMIN_BASE = '/api/admin'

export const invitationStatusSchema = z.enum(['pending', 'used', 'expired', 'revoked'])
export type InvitationStatus = z.infer<typeof invitationStatusSchema>

export const adminInvitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  status: invitationStatusSchema,
  invited_by: z.string().nullable(),
  consumed_by_user_id: z.string().nullable(),
  expires_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type AdminInvitation = z.infer<typeof adminInvitationSchema>

export const memberSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  banned: z.boolean(),
  created_at: z.string(),
})
export type Member = z.infer<typeof memberSchema>

export interface CursorResult<T> {
  readonly nextCursor: string | null
  readonly items: readonly T[]
}

export async function fetchInvitations(
  opts: { status?: InvitationStatus; cursor?: string } = {},
): Promise<{ invitations: AdminInvitation[]; nextCursor: string | null }> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${ADMIN_BASE}/invitations`, {
    schema: z.array(adminInvitationSchema),
    where: 'fetchInvitations',
    query: { status: opts.status, cursor: opts.cursor },
  })
  return { invitations: envelope.data, nextCursor: nextCursorFromLinks(envelope.links) }
}

export async function createInvitation(input: {
  email: string
  expiresInHours?: number
}): Promise<AdminInvitation> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${ADMIN_BASE}/invitations`, {
    method: 'POST',
    body: {
      email: input.email,
      ...(input.expiresInHours !== undefined ? { expires_in_hours: input.expiresInHours } : {}),
    },
    schema: adminInvitationSchema,
    where: 'createInvitation',
  })
  return envelope.data
}

export async function revokeInvitation(id: string): Promise<void> {
  await fetchVoid(apiBaseUrl(), `${ADMIN_BASE}/invitations/${id}`, {
    method: 'DELETE',
    where: 'revokeInvitation',
  })
}

export async function fetchMembers(
  opts: { cursor?: string } = {},
): Promise<{ members: Member[]; nextCursor: string | null }> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${ADMIN_BASE}/members`, {
    schema: z.array(memberSchema),
    where: 'fetchMembers',
    query: { cursor: opts.cursor },
  })
  return { members: envelope.data, nextCursor: nextCursorFromLinks(envelope.links) }
}

async function memberAction(id: string, action: string, body?: unknown): Promise<Member> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${ADMIN_BASE}/members/${id}/${action}`, {
    method: 'POST',
    ...(body !== undefined ? { body } : {}),
    schema: memberSchema,
    where: `member:${action}`,
  })
  return envelope.data
}

export function revokeMember(id: string): Promise<Member> {
  return memberAction(id, 'revoke')
}

export function restoreMember(id: string): Promise<Member> {
  return memberAction(id, 'restore')
}

export function setMemberRole(id: string, role: 'admin' | 'member'): Promise<Member> {
  return memberAction(id, 'role', { role })
}
