import { describe, expect, it } from 'vitest'
import { MockEmailProvider } from '../../../src/infrastructure/email/MockEmailProvider'
import { ResendEmailProvider } from '../../../src/infrastructure/email/ResendEmailProvider'
import {
  EmailProviderConfigError,
  selectEmailProvider,
} from '../../../src/infrastructure/email/selectEmailProvider'

describe('selectEmailProvider', () => {
  it('defaults to mock in development', () => {
    const result = selectEmailProvider({
      nodeEnv: 'development',
      emailProviderEnv: undefined,
      resendApiKey: undefined,
      emailFrom: undefined,
    })
    expect(result.choice).toBe('mock')
    expect(result.source).toBe('default')
    expect(result.provider).toBeInstanceOf(MockEmailProvider)
  })

  it('defaults to resend in production and requires RESEND_API_KEY', () => {
    expect(() =>
      selectEmailProvider({
        nodeEnv: 'production',
        emailProviderEnv: undefined,
        resendApiKey: undefined,
        emailFrom: 'dIAlogus <noreply@example.com>',
      }),
    ).toThrow(EmailProviderConfigError)
  })

  it('honors an explicit mock selection with source "env"', () => {
    const result = selectEmailProvider({
      nodeEnv: 'production',
      emailProviderEnv: 'mock',
      resendApiKey: undefined,
      emailFrom: undefined,
    })
    expect(result.choice).toBe('mock')
    expect(result.source).toBe('env')
    expect(result.provider).toBeInstanceOf(MockEmailProvider)
  })

  it('builds a Resend provider when explicitly selected with key + from', () => {
    const result = selectEmailProvider({
      nodeEnv: 'development',
      emailProviderEnv: 'resend',
      resendApiKey: 'test-key',
      emailFrom: 'dIAlogus <noreply@example.com>',
    })
    expect(result.choice).toBe('resend')
    expect(result.source).toBe('env')
    expect(result.provider).toBeInstanceOf(ResendEmailProvider)
  })

  it('throws when resend is selected without EMAIL_FROM', () => {
    expect(() =>
      selectEmailProvider({
        nodeEnv: 'development',
        emailProviderEnv: 'resend',
        resendApiKey: 'test-key',
        emailFrom: undefined,
      }),
    ).toThrow(/EMAIL_FROM/)
  })
})
