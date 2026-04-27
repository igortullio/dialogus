import type { Database } from '@dialogus/db'
import { Hono } from 'hono'
import { pino } from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const probeDbMock = vi.hoisted(() => vi.fn())
const probePgBossMock = vi.hoisted(() => vi.fn())
const dbClientEndMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

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
    probeDb: probeDbMock,
    probePgBoss: probePgBossMock,
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
  probeDbMock.mockReset().mockResolvedValue(true)
  probePgBossMock.mockReset().mockResolvedValue(true)
  dbClientEndMock.mockClear()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('apps/api boot', () => {
  it('binds to an ephemeral port and serves GET /health when API_PORT=0', async () => {
    setValidEnv()
    const { lines, logger } = captureLogs()

    const { start } = await import('../src/index')
    const boot = await start({ logger })
    try {
      expect(boot.port).toBeGreaterThan(0)
      expect(boot.config.API_PORT).toBe(0)

      const res = await fetch(`http://127.0.0.1:${boot.port}/health`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toMatch(/application\/json/)
      expect(await res.json()).toEqual({ api: 'up', db: 'up', pgboss: 'up', mastra: 'down' })

      const startupLine = lines.find(
        (line) => typeof line.msg === 'string' && /api listening on :/.test(line.msg as string),
      )
      expect(startupLine).toBeDefined()
    } finally {
      await boot.shutdown()
    }
  })

  it('logs API_PORT and a redacted DATABASE_URL on startup (no password)', async () => {
    setValidEnv({ DATABASE_URL: 'postgres://user:secretpass@db.example.com:5432/dialogus' })
    const { lines, logger } = captureLogs()

    const { start } = await import('../src/index')
    const boot = await start({ logger })
    try {
      const startupLine = lines.find(
        (line) => typeof line.msg === 'string' && /api listening on :/.test(line.msg as string),
      )
      expect(startupLine).toBeDefined()
      expect(startupLine?.NODE_ENV).toBe('test')
      expect(startupLine?.API_PORT).toBe(boot.port)
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
    process.env.API_PORT = '0'

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
    expect(dbClientEndMock).toHaveBeenCalledTimes(1)
  })

  it('shutdown is idempotent (second call resolves without re-closing)', async () => {
    setValidEnv()
    const { logger } = captureLogs()

    const { start } = await import('../src/index')
    const boot = await start({ logger })
    await boot.shutdown()
    await boot.shutdown()
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
  })

  it('does not start a long-running pg-boss instance at boot', async () => {
    setValidEnv()
    const { logger } = captureLogs()
    const dbModule = await import('@dialogus/db')
    const createPgBossSpy = vi.spyOn(dbModule, 'createPgBoss')

    const { start } = await import('../src/index')
    const boot = await start({ logger })
    try {
      expect(createPgBossSpy).not.toHaveBeenCalled()
      expect((boot as unknown as { boss?: unknown }).boss).toBeUndefined()
    } finally {
      await boot.shutdown()
      createPgBossSpy.mockRestore()
    }
  })

  it('mounts catalog routes provided via the routes option', async () => {
    setValidEnv()
    const { logger } = captureLogs()
    const catalog = new Hono()
    catalog.get('/search', (c) => c.json({ data: [], meta: { count: 0 } }, 200))

    const { start } = await import('../src/index')
    const boot = await start({
      logger,
      routes: [{ prefix: '/api/catalog', app: catalog }],
    })
    try {
      const res = await fetch(`http://127.0.0.1:${boot.port}/api/catalog/search`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { data: unknown; meta: { count: number } }
      expect(body).toEqual({ data: [], meta: { count: 0 } })
    } finally {
      await boot.shutdown()
    }
  })

  it('request-id middleware echoes a generated x-trace-id on every response', async () => {
    setValidEnv()
    const { logger } = captureLogs()

    const { start } = await import('../src/index')
    const boot = await start({ logger })
    try {
      const res = await fetch(`http://127.0.0.1:${boot.port}/health`)
      const traceId = res.headers.get('x-trace-id')
      expect(traceId).toBeTruthy()
      expect(traceId).toMatch(/^[0-9a-f-]{36}$/i)
    } finally {
      await boot.shutdown()
    }
  })

  it('request-id middleware preserves an incoming x-trace-id header', async () => {
    setValidEnv()
    const { logger } = captureLogs()

    const { start } = await import('../src/index')
    const boot = await start({ logger })
    try {
      const res = await fetch(`http://127.0.0.1:${boot.port}/health`, {
        headers: { 'x-trace-id': 'incoming-trace-1' },
      })
      expect(res.headers.get('x-trace-id')).toBe('incoming-trace-1')
    } finally {
      await boot.shutdown()
    }
  })

  it('problem middleware converts thrown errors from mounted routes into RFC 9457 envelopes', async () => {
    setValidEnv()
    const { logger } = captureLogs()
    const { BookNotFoundError } = await import('@dialogus/catalog')
    const catalog = new Hono()
    catalog.get('/books/:id', () => {
      throw new BookNotFoundError('Book uuid-x not found')
    })

    const { start } = await import('../src/index')
    const boot = await start({
      logger,
      routes: [{ prefix: '/api/catalog', app: catalog }],
    })
    try {
      const res = await fetch(`http://127.0.0.1:${boot.port}/api/catalog/books/abc`)
      expect(res.status).toBe(404)
      expect(res.headers.get('content-type')).toBe('application/problem+json')
      const body = (await res.json()) as Record<string, unknown>
      expect(body.status).toBe(404)
      expect(body.detail).toBe('Book uuid-x not found')
      expect(body.instance).toBe('/api/catalog/books/abc')
    } finally {
      await boot.shutdown()
    }
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
