import { Resend } from 'resend'
import type { EmailProvider, SendEmailInput } from './EmailProvider'

export interface ResendEmailProviderOptions {
  readonly apiKey: string
  /** Verified sender, e.g. `dIAlogus <noreply@yourdomain>`. */
  readonly from: string
}

/** Production email provider backed by the Resend HTTP API. */
export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend
  private readonly from: string

  constructor(options: ResendEmailProviderOptions) {
    this.client = new Resend(options.apiKey)
    this.from = options.from
  }

  async send(input: SendEmailInput): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    })
    if (error) {
      throw new Error(`Resend failed to send email: ${error.message}`)
    }
  }
}
