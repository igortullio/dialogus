import type { DialogusEnv } from '@dialogus/shared/config'
import type { Logger } from 'pino'
import type { EmailProvider } from './EmailProvider'
import { MockEmailProvider } from './MockEmailProvider'
import { ResendEmailProvider } from './ResendEmailProvider'

export type EmailProviderChoice = 'mock' | 'resend'
export type EmailProviderSource = 'env' | 'default'

export interface SelectedEmailProvider {
  readonly provider: EmailProvider
  readonly choice: EmailProviderChoice
  readonly source: EmailProviderSource
}

export interface SelectEmailProviderInput {
  readonly nodeEnv: DialogusEnv['NODE_ENV']
  readonly emailProviderEnv: DialogusEnv['EMAIL_PROVIDER']
  readonly resendApiKey: string | undefined
  readonly emailFrom: string | undefined
  readonly logger?: Pick<Logger, 'info'>
}

export class EmailProviderConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailProviderConfigError'
  }
}

/**
 * Resolves the email provider following the same shape as
 * `selectEmbeddingProvider`: an explicit `EMAIL_PROVIDER` env wins (source
 * 'env'); absence defaults to 'resend' in production, else 'mock' (source
 * 'default'). Choosing 'resend' (explicitly or via production) requires both
 * `RESEND_API_KEY` and `EMAIL_FROM`.
 */
export function selectEmailProvider(input: SelectEmailProviderInput): SelectedEmailProvider {
  const explicit = input.emailProviderEnv ?? null
  const choice: EmailProviderChoice =
    explicit ?? (input.nodeEnv === 'production' ? 'resend' : 'mock')
  const source: EmailProviderSource = explicit ? 'env' : 'default'

  if (choice === 'resend') {
    if (!input.resendApiKey || input.resendApiKey.length === 0) {
      throw new EmailProviderConfigError(
        'RESEND_API_KEY is required when EMAIL_PROVIDER=resend (or NODE_ENV=production)',
      )
    }
    if (!input.emailFrom || input.emailFrom.length === 0) {
      throw new EmailProviderConfigError(
        'EMAIL_FROM is required when EMAIL_PROVIDER=resend (or NODE_ENV=production)',
      )
    }
    return {
      provider: new ResendEmailProvider({ apiKey: input.resendApiKey, from: input.emailFrom }),
      choice,
      source,
    }
  }

  return { provider: new MockEmailProvider({ logger: input.logger }), choice, source }
}
