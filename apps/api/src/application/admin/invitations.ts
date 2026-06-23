import type { EmailProvider } from '../../infrastructure/email'
import { InvitationConflictError, InvitationInvalidError } from './errors'
import type { AdminRepository, CursorPage, InvitationRecord, ListInvitationsInput } from './ports'

const DEFAULT_EXPIRY_HOURS = 168 // 7 days
const HOUR_MS = 3_600_000

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function acceptInviteUrl(appUrl: string, invitationId: string): string {
  return `${appUrl.replace(/\/+$/, '')}/accept-invite?invitation=${invitationId}`
}

export interface InvitationServiceDeps {
  readonly repo: AdminRepository
  readonly email: EmailProvider
  readonly appUrl: string
  readonly now?: () => Date
  readonly defaultExpiryHours?: number
}

export interface CreateInvitationCommand {
  readonly email: string
  readonly invitedBy: string | null
  readonly expiresInHours?: number
}

/**
 * Authorize an email (FR-014): create a single live `pending` invitation and
 * email the accept-invite link (FR built on the `sendEmail()` port). Refuses if
 * an account or another live invitation already exists for the email.
 */
export async function createInvitation(
  deps: InvitationServiceDeps,
  command: CreateInvitationCommand,
): Promise<InvitationRecord> {
  const email = normalizeEmail(command.email)

  if (await deps.repo.userExistsByEmail(email)) {
    throw new InvitationConflictError('An account already exists for this email')
  }
  if (await deps.repo.findOpenInvitationByEmail(email)) {
    throw new InvitationConflictError('A live invitation already exists for this email')
  }

  const now = (deps.now ?? (() => new Date()))()
  const hours = command.expiresInHours ?? deps.defaultExpiryHours ?? DEFAULT_EXPIRY_HOURS
  const expiresAt = new Date(now.getTime() + hours * HOUR_MS)

  const invitation = await deps.repo.createInvitation({
    email,
    invitedBy: command.invitedBy,
    expiresAt,
  })

  await sendInvitationEmail(deps, invitation)
  return invitation
}

async function sendInvitationEmail(
  deps: InvitationServiceDeps,
  invitation: InvitationRecord,
): Promise<void> {
  const url = acceptInviteUrl(deps.appUrl, invitation.id)
  await deps.email.send({
    to: invitation.email,
    subject: 'Você foi convidado para o dIAlogus',
    html: `<p>Você foi convidado para criar sua conta no dIAlogus.</p><p><a href="${url}">Aceitar convite e criar conta</a></p><p>Este convite é de uso único e expira em breve. Se você não esperava este e-mail, ignore-o.</p>`,
    text: `Você foi convidado para o dIAlogus. Aceite seu convite: ${url}`,
  })
}

export async function listInvitations(
  deps: Pick<InvitationServiceDeps, 'repo'>,
  input: ListInvitationsInput,
): Promise<CursorPage<InvitationRecord>> {
  return deps.repo.listInvitations(input)
}

/** Revoke a pending invitation (status → `revoked`). Non-pending ⇒ invalid. */
export async function revokeInvitation(
  deps: Pick<InvitationServiceDeps, 'repo'>,
  invitationId: string,
): Promise<void> {
  const invitation = await deps.repo.findInvitationById(invitationId)
  if (!invitation || invitation.status !== 'pending') {
    throw new InvitationInvalidError()
  }
  await deps.repo.setInvitationStatus(invitationId, 'revoked')
}

export interface AcceptInvitationDeps {
  readonly repo: AdminRepository
  readonly now?: () => Date
  /**
   * Creates the Better Auth account (member role) for the invited email. The
   * `user.create.before` allowlist hook re-validates the invitation and the
   * `after` hook marks it `used` + audits `account_created`.
   */
  readonly createAccount: (input: {
    email: string
    name: string
    password: string
  }) => Promise<{ id: string }>
}

export interface AcceptInvitationCommand {
  readonly invitationId: string
  readonly name: string
  readonly password: string
}

/**
 * Accept an invitation and provision the account (FR-016, single-use). The
 * invitation must be `pending` and unexpired; the sign-up hook consumes it.
 */
export async function acceptInvitation(
  deps: AcceptInvitationDeps,
  command: AcceptInvitationCommand,
): Promise<{ userId: string }> {
  const invitation = await deps.repo.findInvitationById(command.invitationId)
  const now = (deps.now ?? (() => new Date()))()
  if (
    !invitation ||
    invitation.status !== 'pending' ||
    invitation.expiresAt.getTime() <= now.getTime()
  ) {
    throw new InvitationInvalidError()
  }

  const created = await deps.createAccount({
    email: invitation.email,
    name: command.name,
    password: command.password,
  })
  return { userId: created.id }
}
