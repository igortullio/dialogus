import type { Logger } from 'pino'
import type { EmailProvider, SendEmailInput } from './EmailProvider'

export interface MockEmailProviderOptions {
  /** Where to record the "sent" email. Defaults to a no-op when omitted. */
  readonly logger?: Pick<Logger, 'info'>
}

/**
 * Deterministic email provider for dev/CI: instead of sending, it logs the
 * recipient, subject, and full body (which carries the invite/reset link) so
 * tests can scrape the link from logs — no network, no external dependency.
 * Mirrors the `EMBEDDING_PROVIDER=mock` convention.
 */
export class MockEmailProvider implements EmailProvider {
  private readonly logger?: Pick<Logger, 'info'>

  constructor(options: MockEmailProviderOptions = {}) {
    this.logger = options.logger
  }

  async send(input: SendEmailInput): Promise<void> {
    this.logger?.info(
      { to: input.to, subject: input.subject, text: input.text ?? input.html },
      'email_sent (mock)',
    )
  }
}
