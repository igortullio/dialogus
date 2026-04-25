import { pathToFileURL } from 'node:url'
import { createDatabase, createPgBoss, type Database, type PgBoss } from '@dialogus/db'
import { type DialogusEnv, loadConfig, loadEnvFromRoot } from '@dialogus/shared/config'
import { type Logger, pino, stdSerializers } from 'pino'
import {
  CLEANUP_IDEMPOTENCY_KEYS_CRON,
  CLEANUP_IDEMPOTENCY_KEYS_JOB,
  createCleanupIdempotencyKeysHandler,
} from './handlers/catalog-cleanup-idempotency-keys'

const SHUTDOWN_TIMEOUT_MS = 10_000

export interface StartOptions {
  logger?: Logger
}

export interface BootResult {
  db: Database
  boss: PgBoss
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

export function createWorkerLogger(level: string): Logger {
  return pino({
    level,
    name: '@dialogus/worker',
    serializers: { error: stdSerializers.err },
  })
}

async function ensureQueue(boss: PgBoss, name: string): Promise<void> {
  const existing = await boss.getQueue(name)
  if (existing == null) {
    await boss.createQueue(name)
  }
}

async function registerCleanupIdempotencyKeys(
  boss: PgBoss,
  db: Database,
  logger: Logger,
): Promise<void> {
  await ensureQueue(boss, CLEANUP_IDEMPOTENCY_KEYS_JOB)
  await boss.schedule(CLEANUP_IDEMPOTENCY_KEYS_JOB, CLEANUP_IDEMPOTENCY_KEYS_CRON, {})
  await boss.work(CLEANUP_IDEMPOTENCY_KEYS_JOB, createCleanupIdempotencyKeysHandler({ db, logger }))
}

export async function start(options: StartOptions = {}): Promise<BootResult> {
  const config = loadConfig()
  const logger = options.logger ?? createWorkerLogger(config.LOG_LEVEL)
  const db = createDatabase(config.DATABASE_URL)
  const boss = createPgBoss(config.DATABASE_URL)

  await boss.start()
  await registerCleanupIdempotencyKeys(boss, db, logger)

  logger.info(
    {
      NODE_ENV: config.NODE_ENV,
      DATABASE_URL: redactDatabaseUrl(config.DATABASE_URL),
    },
    'worker started',
  )

  let shuttingDown: Promise<void> | undefined
  const shutdown = (): Promise<void> => {
    if (shuttingDown) return shuttingDown
    shuttingDown = (async () => {
      const force = setTimeout(() => {
        logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'shutdown timed out, forcing exit')
      }, SHUTDOWN_TIMEOUT_MS).unref()
      try {
        try {
          await boss.stop({ graceful: false })
        } catch (error) {
          logger.error({ error }, 'failed to stop pg-boss')
        }
        const client = (
          db as unknown as { $client?: { end: (opts?: { timeout?: number }) => Promise<void> } }
        ).$client
        if (client) {
          try {
            await client.end({ timeout: 5 })
          } catch (error) {
            logger.error({ error }, 'failed to close database client')
          }
        }
      } finally {
        clearTimeout(force)
      }
    })()
    return shuttingDown
  }

  return { db, boss, logger, config, shutdown }
}

export function attachSignalHandlers(
  boot: BootResult,
  onExit: (code: number) => void = (code) => process.exit(code),
): () => void {
  const handle = (signal: NodeJS.Signals): void => {
    boot.logger.info({ signal }, `${signal} received, stopping worker`)
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
    const logger = createWorkerLogger('error')
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
