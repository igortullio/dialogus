import { type DialogusEnv, envSchema, loadConfig } from '@dialogus/shared/config'
import { ConfigError, DialogusError } from '@dialogus/shared/errors'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const ORIGINAL_ENV = process.env

const DIALOGUS_KEYS = [
  'NODE_ENV',
  'DATABASE_URL',
  'API_PORT',
  'WEB_PORT',
  'NEXT_PUBLIC_API_URL',
  'LOG_LEVEL',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'NEXT_PUBLIC_MASTRA_URL',
] as const

function clearedEnv(): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...ORIGINAL_ENV }
  for (const key of DIALOGUS_KEYS) delete next[key]
  return next
}

function withEnv(overrides: Record<string, string | undefined>) {
  const next = clearedEnv()
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete next[key]
    else next[key] = value
  }
  process.env = next
}

describe('envSchema', () => {
  it('infers DialogusEnv shape from the schema', () => {
    const parsed: DialogusEnv = envSchema.parse({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/dialogus',
    })
    expect(parsed.NODE_ENV).toBe('development')
    expect(parsed.LOG_LEVEL).toBe('info')
    expect(parsed.API_PORT).toBe(3001)
    expect(parsed.WEB_PORT).toBe(3000)
    expect(parsed.NEXT_PUBLIC_API_URL).toBe('http://localhost:3001')
  })
})

describe('loadConfig', () => {
  beforeEach(() => {
    process.env = clearedEnv()
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('returns parsed env with defaults applied on the happy path', () => {
    withEnv({ DATABASE_URL: 'postgres://user:pass@localhost:5432/dialogus' })
    const cfg = loadConfig()
    expect(cfg.DATABASE_URL).toBe('postgres://user:pass@localhost:5432/dialogus')
    expect(cfg.NODE_ENV).toBe('development')
    expect(cfg.LOG_LEVEL).toBe('info')
    expect(cfg.API_PORT).toBe(3001)
    expect(cfg.WEB_PORT).toBe(3000)
    expect(cfg.NEXT_PUBLIC_API_URL).toBe('http://localhost:3001')
  })

  it('coerces numeric port strings from process.env', () => {
    withEnv({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/dialogus',
      API_PORT: '4000',
      WEB_PORT: '4100',
    })
    const cfg = loadConfig()
    expect(cfg.API_PORT).toBe(4000)
    expect(cfg.WEB_PORT).toBe(4100)
  })

  it('defaults NEXT_PUBLIC_API_URL to http://localhost:3001 when absent', () => {
    withEnv({ DATABASE_URL: 'postgres://user:pass@localhost:5432/dialogus' })
    const cfg = loadConfig()
    expect(cfg.NEXT_PUBLIC_API_URL).toBe('http://localhost:3001')
  })

  it('accepts optional future keys without requiring them', () => {
    withEnv({ DATABASE_URL: 'postgres://user:pass@localhost:5432/dialogus' })
    const cfg = loadConfig()
    expect(cfg.ANTHROPIC_API_KEY).toBeUndefined()
    expect(cfg.OPENAI_API_KEY).toBeUndefined()
    expect(cfg.NEXT_PUBLIC_MASTRA_URL).toBeUndefined()
  })

  it('throws ConfigError naming DATABASE_URL when it is missing', () => {
    withEnv({})
    try {
      loadConfig()
      expect.fail('expected loadConfig to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError)
      expect(err).toBeInstanceOf(DialogusError)
      expect((err as ConfigError).code).toBe('INVALID_ENV')
      expect((err as Error).message).toContain('DATABASE_URL')
    }
  })

  it('throws ConfigError naming API_PORT when it is malformed', () => {
    withEnv({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/dialogus',
      API_PORT: 'abc',
    })
    try {
      loadConfig()
      expect.fail('expected loadConfig to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError)
      expect((err as Error).message).toContain('API_PORT')
    }
  })

  it('groups multiple invalid fields into a single error message', () => {
    withEnv({ API_PORT: 'abc' })
    try {
      loadConfig()
      expect.fail('expected loadConfig to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError)
      const msg = (err as Error).message
      expect(msg).toContain('DATABASE_URL')
      expect(msg).toContain('API_PORT')
    }
  })
})
