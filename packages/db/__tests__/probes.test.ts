import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../src/client'
import { probeDb, probePgBoss } from '../src/probes'

function makeDb(execute: ReturnType<typeof vi.fn>): Database {
  return { execute } as unknown as Database
}

describe('probeDb', () => {
  it('returns true when execute resolves', async () => {
    const execute = vi.fn().mockResolvedValue([{ '?column?': 1 }])
    await expect(probeDb(makeDb(execute))).resolves.toBe(true)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('returns false when execute throws (e.g. connection refused)', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(probeDb(makeDb(execute))).resolves.toBe(false)
  })

  it('returns false when execute throws a non-Error value', async () => {
    const execute = vi.fn().mockRejectedValue('boom')
    await expect(probeDb(makeDb(execute))).resolves.toBe(false)
  })
})

describe('probePgBoss', () => {
  it('returns true when query returns a row for schema pgboss', async () => {
    const execute = vi.fn().mockResolvedValue([{ schema_name: 'pgboss' }])
    await expect(probePgBoss(makeDb(execute))).resolves.toBe(true)
  })

  it('returns false when query returns an empty result', async () => {
    const execute = vi.fn().mockResolvedValue([])
    await expect(probePgBoss(makeDb(execute))).resolves.toBe(false)
  })

  it('returns false when execute throws', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('connection lost'))
    await expect(probePgBoss(makeDb(execute))).resolves.toBe(false)
  })
})
