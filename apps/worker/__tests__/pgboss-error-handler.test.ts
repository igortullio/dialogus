import { EventEmitter } from 'node:events'
import type { PgBoss } from '@dialogus/db'
import type { Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { attachBossErrorHandler } from '../src/index'

describe('attachBossErrorHandler', () => {
  it('logs pg-boss errors instead of letting an unhandled "error" event crash the process', () => {
    const boss = new EventEmitter()
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }

    attachBossErrorHandler(boss as unknown as PgBoss, logger as unknown as Logger)

    const err = new Error('Connection terminated unexpectedly')
    // A bare EventEmitter throws on emit('error') when no listener is attached;
    // after wiring the handler the worker must absorb and log it instead.
    expect(() => boss.emit('error', err)).not.toThrow()
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: err, event: 'pgboss_error' }),
      expect.any(String),
    )
  })
})
