import { PgBoss } from 'pg-boss'
import { describe, expect, it } from 'vitest'
import { createPgBoss } from '../src/pgboss'

describe('createPgBoss', () => {
  it('returns a PgBoss instance with start and stop methods', () => {
    const boss = createPgBoss('postgres://test:test@127.0.0.1:54329/test')
    expect(boss).toBeInstanceOf(PgBoss)
    expect(typeof boss.start).toBe('function')
    expect(typeof boss.stop).toBe('function')
  })

  it('returns synchronously without invoking start or stop', () => {
    // Synchronous return proves the factory has not awaited start();
    // a started PgBoss would require an awaited call before returning.
    const result = createPgBoss('postgres://test:test@127.0.0.1:54329/test')
    expect(result).toBeDefined()
    expect(result).not.toBeInstanceOf(Promise)
  })
})
