import { z } from 'zod'
import { apiBaseUrl, fetchEnvelope } from './_envelope'

const INVITATIONS_BASE = '/api/invitations'

const invitationInfoSchema = z.object({
  email: z.string(),
  status: z.string(),
})
export type InvitationInfo = z.infer<typeof invitationInfoSchema>

const acceptResultSchema = z.object({ user_id: z.string() })

/**
 * Reads the invited email + status for an accept-invite token (the invitation
 * id). Rejects (`ApiError` 410 `invitation-invalid`) for used/expired/unknown
 * tokens so the accept page can show a friendly error.
 */
export async function fetchInvitationInfo(token: string): Promise<InvitationInfo> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${INVITATIONS_BASE}/${token}`, {
    schema: invitationInfoSchema,
    where: 'fetchInvitationInfo',
  })
  return envelope.data
}

/** Accepts an invitation and provisions the account. */
export async function acceptInvitation(input: {
  invitation: string
  name: string
  password: string
}): Promise<{ userId: string }> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${INVITATIONS_BASE}/accept`, {
    method: 'POST',
    body: input,
    schema: acceptResultSchema,
    where: 'acceptInvitation',
  })
  return { userId: envelope.data.user_id }
}
