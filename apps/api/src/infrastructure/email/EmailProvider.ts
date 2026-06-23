/** A transactional email to send (invitations, password resets). */
export interface SendEmailInput {
  readonly to: string
  readonly subject: string
  /** Rendered HTML body. */
  readonly html: string
  /** Optional plain-text fallback (also carries the link for the mock provider). */
  readonly text?: string
}

/**
 * Internal port for sending transactional email. Implemented by
 * `ResendEmailProvider` (production) and `MockEmailProvider` (dev/CI), selected
 * via `selectEmailProvider`. Better Auth's `sendResetPassword` and the
 * invitation flow both go through this single port.
 */
export interface EmailProvider {
  send(input: SendEmailInput): Promise<void>
}
