import type { Database } from '@dialogus/db'
import type { Job } from '@dialogus/db/pgboss'
import { idempotencyKeys } from '@dialogus/db/schema'
import { lt, sql } from 'drizzle-orm'
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import {
  CLEANUP_IDEMPOTENCY_KEYS_CRON,
  CLEANUP_IDEMPOTENCY_KEYS_JOB,
  createCleanupIdempotencyKeysHandler,
  runCleanupIdempotencyKeys,
} from '../../src/handlers/catalog-cleanup-idempotency-keys'

interface CapturedLogs {
  lines: Array<Record<string, unknown>>
  logger: ReturnType<typeof pino>
}

function captureLogs(level = 'info'): CapturedLogs {
  const lines: Array<Record<string, unknown>> = []
  const stream = {
    write(chunk: string): void {
      for (const raw of chunk.split('\n')) {
        if (!raw) continue
        try {
          lines.push(JSON.parse(raw) as Record<string, unknown>)
        } catch {
          // ignore non-JSON lines
        }
      }
    },
  }
  const logger = pino({ level }, stream as unknown as NodeJS.WritableStream)
  return { lines, logger }
}

interface FakeDb {
  db: Database
  deleteSpy: ReturnType<typeof vi.fn>
  whereSpy: ReturnType<typeof vi.fn>
  returningSpy: ReturnType<typeof vi.fn>
}

function buildFakeDb(deletedRows: Array<{ key: string }>): FakeDb {
  const returningSpy = vi.fn().mockResolvedValue(deletedRows)
  const whereSpy = vi.fn().mockReturnValue({ returning: returningSpy })
  const deleteSpy = vi.fn().mockReturnValue({ where: whereSpy })
  const db = { delete: deleteSpy } as unknown as Database
  return { db, deleteSpy, whereSpy, returningSpy }
}

describe('apps/worker cleanup-idempotency-keys handler', () => {
  it('exposes the canonical job name and hourly cron expression', () => {
    expect(CLEANUP_IDEMPOTENCY_KEYS_JOB).toBe('catalog.cleanup-idempotency-keys')
    expect(CLEANUP_IDEMPOTENCY_KEYS_CRON).toBe('0 * * * *')
  })

  it('runs DELETE on idempotency_keys older than 24 hours and returns the row count', async () => {
    const { db, deleteSpy, whereSpy, returningSpy } = buildFakeDb([{ key: 'a' }, { key: 'b' }])
    const { lines, logger } = captureLogs()

    const result = await runCleanupIdempotencyKeys({ db, logger })

    expect(result).toEqual({ deleted: 2 })
    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledWith(idempotencyKeys)
    expect(whereSpy).toHaveBeenCalledTimes(1)
    const whereArg = whereSpy.mock.calls[0]?.[0] as ReturnType<typeof lt>
    expect(whereArg).toEqual(lt(idempotencyKeys.createdAt, sql`now() - interval '24 hours'`))
    expect(returningSpy).toHaveBeenCalledTimes(1)
    expect(returningSpy).toHaveBeenCalledWith({ key: idempotencyKeys.key })

    const logLine = lines.find(
      (line) => typeof line.msg === 'string' && /idempotency keys cleanup complete/.test(line.msg),
    )
    expect(logLine).toMatchObject({
      job: CLEANUP_IDEMPOTENCY_KEYS_JOB,
      deleted: 2,
    })
  })

  it('returns { deleted: 0 } without error when no rows match', async () => {
    const { db, returningSpy } = buildFakeDb([])
    const { lines, logger } = captureLogs()

    const result = await runCleanupIdempotencyKeys({ db, logger })

    expect(result).toEqual({ deleted: 0 })
    expect(returningSpy).toHaveBeenCalledTimes(1)
    const logLine = lines.find(
      (line) => typeof line.msg === 'string' && /idempotency keys cleanup complete/.test(line.msg),
    )
    expect(logLine).toMatchObject({ deleted: 0 })
  })

  it('is callable without a logger', async () => {
    const { db } = buildFakeDb([{ key: 'x' }])
    await expect(runCleanupIdempotencyKeys({ db })).resolves.toEqual({ deleted: 1 })
  })

  it('createCleanupIdempotencyKeysHandler returns a pg-boss-compatible handler', async () => {
    const { db, deleteSpy } = buildFakeDb([{ key: 'k' }])
    const { logger } = captureLogs()
    const handler = createCleanupIdempotencyKeysHandler({ db, logger })

    const result = await handler([] as unknown as Job<unknown>[])

    expect(result).toEqual({ deleted: 1 })
    expect(deleteSpy).toHaveBeenCalledTimes(1)
  })
})
