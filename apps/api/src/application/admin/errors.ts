import { DialogusError } from '@dialogus/shared/errors'

/** Removing or demoting the only active administrator is refused (FR-017). */
export class LastAdminError extends DialogusError {
  constructor(message = 'Cannot remove or demote the only administrator') {
    super('LAST_ADMIN', message)
  }
}

/**
 * An invitation can no longer be acted on: not `pending`, already consumed,
 * revoked, expired, or unknown (FR-016). Maps to `invitation-invalid`.
 */
export class InvitationInvalidError extends DialogusError {
  constructor(message = 'This invitation is no longer valid') {
    super('INVITATION_INVALID', message)
  }
}

/** A live invitation or an account already exists for the email (allowlist contract). */
export class InvitationConflictError extends DialogusError {
  constructor(message = 'An invitation or account already exists for this email') {
    super('INVITATION_CONFLICT', message)
  }
}

/** The targeted member id does not exist. Maps to `member-not-found` (404). */
export class MemberNotFoundError extends DialogusError {
  constructor(message = 'Member not found') {
    super('MEMBER_NOT_FOUND', message)
  }
}
