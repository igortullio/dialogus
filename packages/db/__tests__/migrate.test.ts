import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const start = vi.fn()
  const stop = vi.fn()
  const migrate = vi.fn()
  const end = vi.fn()
  const createDatabase = vi.fn()
  const createPgBoss = vi.fn()
  const info = vi.fn()
  const error = vi.fn()
  return { start, stop, migrate, end, createDatabase, createPgBoss, info, error }
})

vi.mock('drizzle-orm/postgres-js/migrator', () => ({ migrate: mocks.migrate }))
vi.mock('../src/client', () => ({ createDatabase: mocks.createDatabase }))
vi.mock('../src/pgboss', () => ({ createPgBoss: mocks.createPgBoss }))
vi.mock('../src/logger', () => ({
  logger: { info: mocks.info, error: mocks.error },
}))

const { runMigrations, isCliEntry } = await import('../src/migrate')

const URL = 'postgres://user:pass@localhost:5432/test'

beforeEach(() => {
  mocks.start.mockReset().mockResolvedValue(undefined)
  mocks.stop.mockReset().mockResolvedValue(undefined)
  mocks.migrate.mockReset().mockResolvedValue(undefined)
  mocks.end.mockReset().mockResolvedValue(undefined)
  mocks.createDatabase.mockReset().mockImplementation(() => ({ $client: { end: mocks.end } }))
  mocks.createPgBoss
    .mockReset()
    .mockImplementation(() => ({ start: mocks.start, stop: mocks.stop }))
  mocks.info.mockReset()
  mocks.error.mockReset()
})

describe('runMigrations', () => {
  it('calls Drizzle migrate first, then pgBoss.start, then pgBoss.stop', async () => {
    await runMigrations(URL)

    expect(mocks.migrate).toHaveBeenCalledTimes(1)
    expect(mocks.start).toHaveBeenCalledTimes(1)
    expect(mocks.stop).toHaveBeenCalledTimes(1)

    const migrateCall = mocks.migrate.mock.invocationCallOrder[0]
    const startCall = mocks.start.mock.invocationCallOrder[0]
    const stopCall = mocks.stop.mock.invocationCallOrder[0]
    expect(migrateCall).toBeLessThan(startCall as number)
    expect(startCall).toBeLessThan(stopCall as number)
  })

  it('passes the migrationsFolder pointing at packages/db/drizzle to migrate', async () => {
    await runMigrations(URL)
    const callArgs = mocks.migrate.mock.calls[0]
    expect(callArgs?.[1]).toMatchObject({
      migrationsFolder: expect.stringMatching(/packages\/db\/drizzle$/),
    })
  })

  it('forwards the connection string to createPgBoss', async () => {
    await runMigrations(URL)
    expect(mocks.createPgBoss).toHaveBeenCalledWith(URL)
  })

  it('logs stages drizzle, pgboss, done in order on success', async () => {
    await runMigrations(URL)
    const stages = mocks.info.mock.calls.map((args) => {
      const ctx = args[0] as { stage: string }
      return ctx.stage
    })
    expect(stages).toEqual(['drizzle', 'pgboss', 'done'])
  })

  it('does not call pgBoss.start when Drizzle migrate throws and propagates the error', async () => {
    const drizzleError = new Error('drizzle boom')
    mocks.migrate.mockRejectedValueOnce(drizzleError)

    await expect(runMigrations(URL)).rejects.toBe(drizzleError)

    expect(mocks.createPgBoss).not.toHaveBeenCalled()
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.stop).not.toHaveBeenCalled()
  })

  it('logs the drizzle stage with error context when Drizzle migrate throws', async () => {
    const drizzleError = new Error('drizzle boom')
    mocks.migrate.mockRejectedValueOnce(drizzleError)

    await expect(runMigrations(URL)).rejects.toThrow()

    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'drizzle', error: drizzleError }),
      expect.any(String),
    )
  })

  it('logs stage pgboss with error before rethrowing when start throws', async () => {
    const bossError = new Error('pgboss boom')
    mocks.start.mockRejectedValueOnce(bossError)

    await expect(runMigrations(URL)).rejects.toBe(bossError)

    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'pgboss', error: bossError }),
      expect.any(String),
    )
    // logger.error fires before the throw — the 'done' info log must NOT appear.
    const doneLogged = mocks.info.mock.calls.some((args) => {
      const ctx = args[0] as { stage?: string } | undefined
      return ctx?.stage === 'done'
    })
    expect(doneLogged).toBe(false)
  })

  it('always closes the underlying postgres client (success path)', async () => {
    await runMigrations(URL)
    expect(mocks.end).toHaveBeenCalledWith({ timeout: 0 })
  })

  it('always closes the underlying postgres client (failure path)', async () => {
    mocks.migrate.mockRejectedValueOnce(new Error('drizzle boom'))
    await expect(runMigrations(URL)).rejects.toThrow()
    expect(mocks.end).toHaveBeenCalledWith({ timeout: 0 })
  })
})

describe('isCliEntry', () => {
  it('returns false when argv[1] is missing', () => {
    expect(isCliEntry('file:///abs/migrate.ts', ['node'])).toBe(false)
  })

  it('returns true when argv[1] resolves to the same module URL', () => {
    expect(isCliEntry('file:///abs/migrate.ts', ['node', '/abs/migrate.ts'])).toBe(true)
  })

  it('returns false when argv[1] resolves to a different module URL', () => {
    expect(isCliEntry('file:///abs/migrate.ts', ['node', '/abs/other.ts'])).toBe(false)
  })
})
