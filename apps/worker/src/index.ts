import { pathToFileURL } from 'node:url'
import { createDatabase, createPgBoss, type Database, type PgBoss } from '@dialogus/db'
import {
  INGESTION_QUEUES,
  type StageDeps,
  type StageHandler,
  type StagePayload,
} from '@dialogus/ingestion/application/stages/_common'
import { chunkStage } from '@dialogus/ingestion/application/stages/chunk'
import { cleanStage } from '@dialogus/ingestion/application/stages/clean'
import { downloadStage } from '@dialogus/ingestion/application/stages/download'
import { embedStage } from '@dialogus/ingestion/application/stages/embed'
import { indexStage } from '@dialogus/ingestion/application/stages/index'
import { parseStage } from '@dialogus/ingestion/application/stages/parse'
import { type DialogusEnv, loadConfig, loadEnvFromRoot } from '@dialogus/shared/config'
import type { Job, WorkOptions } from 'pg-boss'
import { type Logger, pino, stdSerializers } from 'pino'
import { type ComposedStageDeps, composeStageDeps } from './deps'
import {
  CLEANUP_IDEMPOTENCY_KEYS_CRON,
  CLEANUP_IDEMPOTENCY_KEYS_JOB,
  createCleanupIdempotencyKeysHandler,
} from './handlers/catalog-cleanup-idempotency-keys'

const SHUTDOWN_TIMEOUT_MS = 15_000
const INGESTION_WORK_OPTIONS: WorkOptions = { batchSize: 1 }

interface IngestionStageRegistration {
  readonly stage: keyof typeof INGESTION_QUEUES
  readonly queue: (typeof INGESTION_QUEUES)[keyof typeof INGESTION_QUEUES]
  readonly handler: StageHandler
}

const INGESTION_STAGE_HANDLERS: readonly IngestionStageRegistration[] = [
  { stage: 'download', queue: INGESTION_QUEUES.download, handler: downloadStage },
  { stage: 'clean', queue: INGESTION_QUEUES.clean, handler: cleanStage },
  { stage: 'parse', queue: INGESTION_QUEUES.parse, handler: parseStage },
  { stage: 'chunk', queue: INGESTION_QUEUES.chunk, handler: chunkStage },
  { stage: 'embed', queue: INGESTION_QUEUES.embed, handler: embedStage },
  { stage: 'index', queue: INGESTION_QUEUES.index, handler: indexStage },
]

export interface StartOptions {
  logger?: Logger
  composeDeps?: (input: {
    db: Database
    boss: PgBoss
    logger: Logger
    config: DialogusEnv
  }) => ComposedStageDeps
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
  logger.info(
    { event: 'handler_registered', queue: CLEANUP_IDEMPOTENCY_KEYS_JOB, schedule: 'hourly' },
    'cleanup handler registered',
  )
}

function buildIngestionWorker(
  handler: StageHandler,
  deps: StageDeps,
): (jobs: Job<StagePayload>[]) => Promise<void> {
  return async (jobs) => {
    for (const job of jobs) {
      await handler(job.data, deps)
    }
  }
}

async function registerIngestionHandlers(
  boss: PgBoss,
  composed: ComposedStageDeps,
  logger: Logger,
): Promise<void> {
  for (const queue of Object.values(INGESTION_QUEUES)) {
    await ensureQueue(boss, queue)
  }
  for (const reg of INGESTION_STAGE_HANDLERS) {
    await boss.work(
      reg.queue,
      INGESTION_WORK_OPTIONS,
      buildIngestionWorker(reg.handler, composed.deps),
    )
    logger.info(
      {
        event: 'handler_registered',
        queue: reg.queue,
        stage: reg.stage,
        batch_size: INGESTION_WORK_OPTIONS.batchSize,
      },
      'ingestion handler registered',
    )
  }
}

export async function start(options: StartOptions = {}): Promise<BootResult> {
  const config = loadConfig()
  const logger = options.logger ?? createWorkerLogger(config.LOG_LEVEL)
  const db = createDatabase(config.DATABASE_URL)
  const boss = createPgBoss(config.DATABASE_URL)

  await boss.start()

  const composeDeps = options.composeDeps ?? composeStageDeps
  const composed = composeDeps({ db, boss, logger, config })
  logger.info(
    {
      event: 'embedding_provider_selected',
      provider: composed.embeddingProvider.choice,
      source: composed.embeddingProvider.source,
      model_name: composed.embeddingProvider.provider.modelName,
    },
    'embedding provider selected',
  )

  await registerCleanupIdempotencyKeys(boss, db, logger)
  await registerIngestionHandlers(boss, composed, logger)

  logger.info(
    {
      event: 'boot_complete',
      NODE_ENV: config.NODE_ENV,
      DATABASE_URL: redactDatabaseUrl(config.DATABASE_URL),
      ingestion_handlers: INGESTION_STAGE_HANDLERS.length,
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
