import { pathToFileURL } from 'node:url'
import { createDatabase, type Database } from '@dialogus/db'
import { type DialogusEnv, loadConfig, loadEnvFromRoot } from '@dialogus/shared/config'
import { type ServerType, serve } from '@hono/node-server'
import { Hono } from 'hono'
import { type Logger, pino, stdSerializers } from 'pino'
import { createHealthRoute } from './infrastructure/http/routes/health'

const SHUTDOWN_TIMEOUT_MS = 10_000

export interface StartOptions {
  logger?: Logger
}

export interface BootResult {
  app: Hono
  db: Database
  server: ServerType
  port: number
  logger: Logger
  config: DialogusEnv
  shutdown: () => Promise<void>
}

export function redactDatabaseUrl(value: string): string {
  try {
    const u = new URL(value)
    const port = u.port ? `:${u.port}` : ''
    return `${u.protocol}//${u.hostname}${port}${u.pathname}`
  } catch {
    return '<invalid>'
  }
}

export function createApiLogger(level: string): Logger {
  return pino({
    level,
    name: '@dialogus/api',
    serializers: { error: stdSerializers.err },
  })
}

export async function start(options: StartOptions = {}): Promise<BootResult> {
  const config = loadConfig()
  const logger = options.logger ?? createApiLogger(config.LOG_LEVEL)
  const db = createDatabase(config.DATABASE_URL)

  const app = new Hono()
  app.route('/health', createHealthRoute({ db }))

  let resolveListening!: (port: number) => void
  const listening = new Promise<number>((res) => {
    resolveListening = res
  })
  const server = serve({ fetch: app.fetch, port: config.API_PORT }, (info) => {
    logger.info(
      {
        NODE_ENV: config.NODE_ENV,
        API_PORT: info.port,
        DATABASE_URL: redactDatabaseUrl(config.DATABASE_URL),
      },
      `api listening on :${info.port}`,
    )
    resolveListening(info.port)
  })
  const port = await listening

  let shuttingDown: Promise<void> | undefined
  const shutdown = (): Promise<void> => {
    if (shuttingDown) return shuttingDown
    shuttingDown = new Promise<void>((res) => {
      const force = setTimeout(() => {
        logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'shutdown timed out, forcing exit')
        res()
      }, SHUTDOWN_TIMEOUT_MS).unref()
      server.close(() => {
        clearTimeout(force)
        const client = (
          db as unknown as { $client?: { end: (opts?: { timeout?: number }) => Promise<void> } }
        ).$client
        if (!client) {
          res()
          return
        }
        client.end({ timeout: 5 }).then(
          () => res(),
          (error: unknown) => {
            logger.error({ error }, 'failed to close database client')
            res()
          },
        )
      })
    })
    return shuttingDown
  }

  return { app, db, server, port, logger, config, shutdown }
}

export function attachSignalHandlers(
  boot: BootResult,
  onExit: (code: number) => void = (code) => process.exit(code),
): () => void {
  const handle = (signal: NodeJS.Signals): void => {
    boot.logger.info({ signal }, `${signal} received, closing server`)
    boot.shutdown().then(
      () => onExit(0),
      (error: unknown) => {
        boot.logger.error({ error }, 'shutdown failed')
        onExit(1)
      },
    )
  }
  const sigterm = (): void => handle('SIGTERM')
  const sigint = (): void => handle('SIGINT')
  process.once('SIGTERM', sigterm)
  process.once('SIGINT', sigint)
  return () => {
    process.off('SIGTERM', sigterm)
    process.off('SIGINT', sigint)
  }
}

export async function main(): Promise<void> {
  try {
    loadEnvFromRoot()
    const boot = await start()
    attachSignalHandlers(boot)
  } catch (error) {
    const logger = createApiLogger('error')
    logger.error({ error }, 'startup failed')
    process.exit(1)
  }
}

export function isCliEntry(metaUrl: string, argv: ReadonlyArray<string>): boolean {
  const entry = argv[1]
  if (!entry) return false
  return metaUrl === pathToFileURL(entry).href
}

/* v8 ignore start */
if (isCliEntry(import.meta.url, process.argv)) {
  void main()
}
/* v8 ignore stop */
