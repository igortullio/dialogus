import type { Database } from '@dialogus/db'
import { pino } from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbClientEndMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

const bossStartMock = vi.hoisted(() => vi.fn())
const bossStopMock = vi.hoisted(() => vi.fn())
const bossGetQueueMock = vi.hoisted(() => vi.fn())
const bossCreateQueueMock = vi.hoisted(() => vi.fn())
const bossScheduleMock = vi.hoisted(() => vi.fn())
const bossWorkMock = vi.hoisted(() => vi.fn())
const createPgBossMock = vi.hoisted(() => vi.fn())

vi.mock('@dialogus/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dialogus/db')>()
  return {
    ...actual,
    createDatabase: vi.fn(
      () =>
        ({
          $client: { end: dbClientEndMock },
        }) as unknown as Database,
    ),
    createPgBoss: createPgBossMock,
  }
})

const ORIGINAL_ENV = { ...process.env }

function setValidEnv(overrides: Record<string, string> = {}): void {
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = 'postgres://user:secret@127.0.0.1:5/dialogus'
  process.env.API_PORT = '0'
  process.env.LOG_LEVEL = 'info'
  for (const [k, v] of Object.entries(overrides)) {
    process.env[k] = v
  }
}

interface CapturedLogs {
  lines: Array<Record<string, unknown>>
  logger: ReturnType<typeof pino>
}

function captureLogs(): CapturedLogs {
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
  const logger = pino({ level: 'info' }, stream as unknown as NodeJS.WritableStream)
  return { lines, logger }
}

beforeEach(() => {
  vi.resetModules()
  dbClientEndMock.mockClear()
  bossStartMock.mockReset().mockResolvedValue({})
  bossStopMock.mockReset().mockResolvedValue(undefined)
  bossGetQueueMock.mockReset().mockResolvedValue(null)
  bossCreateQueueMock.mockReset().mockResolvedValue(undefined)
  bossScheduleMock.mockReset().mockResolvedValue(undefined)
  bossWorkMock.mockReset().mockResolvedValue('worker-id')
  createPgBossMock.mockReset().mockImplementation(() => ({
    start: bossStartMock,
    stop: bossStopMock,
    getQueue: bossGetQueueMock,
    createQueue: bossCreateQueueMock,
    schedule: bossScheduleMock,
    work: bossWorkMock,
  }))
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('apps/worker boot', () => {
  it('starts pg-boss with the configured DATABASE_URL', async () => {
    setValidEnv({ DATABASE_URL: 'postgres://user:pw@db.example.com:5432/dialogus' })
    const { logger } = captureLogs()

    const { start } = await import('../src/index')
    const boot = await start({ logger })
    try {
      expect(createPgBossMock).toHaveBeenCalledWith(
        'postgres://user:pw@db.example.com:5432/dialogus',
      )
      expect(bossStartMock).toHaveBeenCalledTimes(1)
      expect(boot.boss).toBeDefined()
    } finally {
      await boot.shutdown()
    }
  })

  it('registers the catalog cleanup queue + schedule + worker handler', async () => {
    setValidEnv()
    const { logger } = captureLogs()

    const { start } = await import('../src/index')
    const boot = await start({ logger })
    try {
      expect(bossGetQueueMock).toHaveBeenCalledWith('catalog.cleanup-idempotency-keys')
      expect(bossCreateQueueMock).toHaveBeenCalledWith('catalog.cleanup-idempotency-keys')
      expect(bossScheduleMock).toHaveBeenCalledTimes(1)
      expect(bossScheduleMock).toHaveBeenCalledWith(
        'catalog.cleanup-idempotency-keys',
        '0 * * * *',
        {},
      )
      expect(bossWorkMock).toHaveBeenCalledTimes(1)
      expect(bossWorkMock.mock.calls[0]?.[0]).toBe('catalog.cleanup-idempotency-keys')
      expect(typeof bossWorkMock.mock.calls[0]?.[1]).toBe('function')
    } finally {
      await boot.shutdown()
    }
  })

  it('does not re-create the cleanup queue when it already exists', async () => {
    setValidEnv()
    bossGetQueueMock.mockResolvedValueOnce({ name: 'catalog.cleanup-idempotency-keys' })
    const { logger } = captureLogs()

    const { start } = await import('../src/index')
    const boot = await start({ logger })
    try {
      expect(bossGetQueueMock).toHaveBeenCalledWith('catalog.cleanup-idempotency-keys')
      expect(bossCreateQueueMock).not.toHaveBeenCalled()
      expect(bossScheduleMock).toHaveBeenCalledTimes(1)
    } finally {
      await boot.shutdown()
    }
  })

  it('logs a redacted DATABASE_URL on startup (no password)', async () => {
    setValidEnv({ DATABASE_URL: 'postgres://user:secretpass@db.example.com:5432/dialogus' })
    const { lines, logger } = captureLogs()

    const { start } = await import('../src/index')
    const boot = await start({ logger })
    try {
      const startupLine = lines.find(
        (line) => typeof line.msg === 'string' && /worker started/.test(line.msg as string),
      )
      expect(startupLine).toBeDefined()
      expect(startupLine?.NODE_ENV).toBe('test')
      expect(startupLine?.DATABASE_URL).toBe('postgres://db.example.com:5432/dialogus')
      const serialized = JSON.stringify(startupLine)
      expect(serialized).not.toContain('secretpass')
      expect(serialized).not.toContain('user:')
    } finally {
      await boot.shutdown()
    }
  })

  it('throws ConfigError when DATABASE_URL is missing/invalid', async () => {
    setValidEnv()
    process.env.DATABASE_URL = 'not-a-valid-url'
    const { logger } = captureLogs()

    const { start } = await import('../src/index')
    await expect(start({ logger })).rejects.toMatchObject({
      name: 'ConfigError',
      code: 'INVALID_ENV',
      message: expect.stringContaining('DATABASE_URL'),
    })
  })

  it('main() exits 1 when env validation fails', async () => {
    setValidEnv()
    delete process.env.DATABASE_URL

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit:${code}`)
    }) as never)
    try {
      const { main } = await import('../src/index')
      await expect(main()).rejects.toThrow('__exit:1')
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('SIGTERM triggers shutdown with exit 0 in well under 10 seconds', async () => {
    setValidEnv()
    const { logger } = captureLogs()

    const { start, attachSignalHandlers } = await import('../src/index')
    const boot = await start({ logger })

    let exitCode: number | undefined
    const detach = attachSignalHandlers(boot, (code) => {
      exitCode = code
    })

    const begin = Date.now()
    process.emit('SIGTERM')
    while (exitCode === undefined) {
      await new Promise((r) => setImmediate(r))
      if (Date.now() - begin > 10_000) break
    }
    detach()

    expect(exitCode).toBe(0)
    expect(Date.now() - begin).toBeLessThan(10_000)
    expect(bossStopMock).toHaveBeenCalledTimes(1)
    expect(dbClientEndMock).toHaveBeenCalledTimes(1)
  })

  it('SIGINT triggers shutdown with exit 0', async () => {
    setValidEnv()
    const { logger } = captureLogs()

    const { start, attachSignalHandlers } = await import('../src/index')
    const boot = await start({ logger })

    let exitCode: number | undefined
    const detach = attachSignalHandlers(boot, (code) => {
      exitCode = code
    })

    process.emit('SIGINT')
    const begin = Date.now()
    while (exitCode === undefined && Date.now() - begin < 5_000) {
      await new Promise((r) => setImmediate(r))
    }
    detach()

    expect(exitCode).toBe(0)
  })

  it('shutdown is idempotent (second call resolves without re-closing)', async () => {
    setValidEnv()
    const { logger } = captureLogs()

    const { start } = await import('../src/index')
    const boot = await start({ logger })
    await boot.shutdown()
    await boot.shutdown()
    expect(dbClientEndMock).toHaveBeenCalledTimes(1)
    expect(bossStopMock).toHaveBeenCalledTimes(1)
  })

  it('shutdown handles db client without $client (no-op DB)', async () => {
    setValidEnv()
    const { logger } = captureLogs()
    const dbModule = await import('@dialogus/db')
    const createDatabaseMock = vi.mocked(dbModule.createDatabase)
    createDatabaseMock.mockReturnValueOnce({} as Database)

    const { start } = await import('../src/index')
    const boot = await start({ logger })
    await boot.shutdown()
    expect(dbClientEndMock).not.toHaveBeenCalled()
    expect(bossStopMock).toHaveBeenCalledTimes(1)
  })
})

describe('redactDatabaseUrl', () => {
  it('strips credentials and returns protocol://host:port/path', async () => {
    const { redactDatabaseUrl } = await import('../src/index')
    expect(redactDatabaseUrl('postgres://user:pw@host.example.com:5432/db')).toBe(
      'postgres://host.example.com:5432/db',
    )
  })

  it('falls back to <invalid> for unparseable input', async () => {
    const { redactDatabaseUrl } = await import('../src/index')
    expect(redactDatabaseUrl('not a url')).toBe('<invalid>')
  })
})
