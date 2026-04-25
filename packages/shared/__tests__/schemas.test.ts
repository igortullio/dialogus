import { type HealthResponse, healthResponseSchema } from '@dialogus/shared/schemas/health'
import { describe, expect, it } from 'vitest'

describe('healthResponseSchema', () => {
  it('accepts the canonical up/up/up response', () => {
    const result = healthResponseSchema.safeParse({ api: 'up', db: 'up', pgboss: 'up' })
    expect(result.success).toBe(true)
    if (result.success) {
      const parsed: HealthResponse = result.data
      expect(parsed.api).toBe('up')
      expect(parsed.db).toBe('up')
      expect(parsed.pgboss).toBe('up')
    }
  })

  it('accepts every valid combination of up/down for db and pgboss', () => {
    for (const db of ['up', 'down'] as const) {
      for (const pgboss of ['up', 'down'] as const) {
        const result = healthResponseSchema.safeParse({ api: 'up', db, pgboss })
        expect(result.success).toBe(true)
      }
    }
  })

  it('rejects unknown enum values on db with a clear path', () => {
    const result = healthResponseSchema.safeParse({ api: 'up', db: 'unknown', pgboss: 'up' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const dbIssue = result.error.issues.find((i) => i.path.join('.') === 'db')
      expect(dbIssue).toBeDefined()
    }
  })

  it("rejects api values other than the literal 'up'", () => {
    const result = healthResponseSchema.safeParse({ api: 'down', db: 'up', pgboss: 'up' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const apiIssue = result.error.issues.find((i) => i.path.join('.') === 'api')
      expect(apiIssue).toBeDefined()
    }
  })

  it('reports every missing field when given an empty object', () => {
    const result = healthResponseSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join('.'))
      expect(fields).toContain('api')
      expect(fields).toContain('db')
      expect(fields).toContain('pgboss')
    }
  })
})
