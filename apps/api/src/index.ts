import { pathToFileURL } from 'node:url'
import { addBookToLibrary, getBook, listLibrary, removeBook, restoreBook } from '@dialogus/catalog'
import { GutendexHttpClient } from '@dialogus/catalog/src/infrastructure/external/GutendexHttpClient'
import { DrizzleBookRepository } from '@dialogus/catalog/src/infrastructure/persistence/DrizzleBookRepository'
import { DrizzleLibraryEntryRepository } from '@dialogus/catalog/src/infrastructure/persistence/DrizzleLibraryEntryRepository'
import { createDatabase, type Database } from '@dialogus/db'
import { type DialogusEnv, loadConfig, loadEnvFromRoot } from '@dialogus/shared/config'
import { type ServerType, serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { type Logger, pino, stdSerializers } from 'pino'
import { createAuth } from './infrastructure/auth/auth'
import { selectEmailProvider } from './infrastructure/email'
import {
  createProblemMiddleware,
  type ProblemVariables,
} from './infrastructure/http/middleware/problem'
import { type RequestIdVariables, requestId } from './infrastructure/http/middleware/request-id'
import { createAuthRoute } from './infrastructure/http/routes/auth'
import { createCatalogRoute } from './infrastructure/http/routes/catalog'
import { createHealthRoute } from './infrastructure/http/routes/health'
import { createLibraryRoute } from './infrastructure/http/routes/library'

const SHUTDOWN_TIMEOUT_MS = 10_000

export type BootVariables = RequestIdVariables & ProblemVariables

export interface RouteMount {
  prefix: string
  app: Hono
}

export interface StartOptions {
  logger?: Logger
  routes?: ReadonlyArray<RouteMount>
  db?: Database
}

export interface BootResult {
  app: Hono<{ Variables: BootVariables }>
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
  const db = options.db ?? createDatabase(config.DATABASE_URL)

  const app = new Hono<{ Variables: BootVariables }>()
  app.use(
    '*',
    cors({
      origin: config.WEB_ORIGIN,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Idempotency-Key', 'Authorization'],
      // Required so the browser sends/stores the Better Auth session cookie on
      // cross-origin calls; origin must stay explicit (never '*') with credentials.
      credentials: true,
      maxAge: 600,
    }),
  )
  app.use('*', requestId())
  app.use('*', createProblemMiddleware({ logger }))
  app.route('/health', createHealthRoute({ db, mastraUrl: config.NEXT_PUBLIC_MASTRA_URL }))
  for (const mount of options.routes ?? []) {
    app.route(mount.prefix, mount.app)
  }

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
    shuttingDown = (async () => {
      const force = setTimeout(() => {
        logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'shutdown timed out, forcing exit')
      }, SHUTDOWN_TIMEOUT_MS).unref()
      try {
        await new Promise<void>((res) => server.close(() => res()))
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
    const config = loadConfig()
    const logger = createApiLogger(config.LOG_LEVEL)
    const db = createDatabase(config.DATABASE_URL)

    const email = selectEmailProvider({
      nodeEnv: config.NODE_ENV,
      emailProviderEnv: config.EMAIL_PROVIDER,
      resendApiKey: config.RESEND_API_KEY,
      emailFrom: config.EMAIL_FROM,
      logger,
    })
    logger.info({ choice: email.choice, source: email.source }, 'email_provider_selected')

    const auth = createAuth({ db, config, emailProvider: email.provider, logger })
    const authApp = createAuthRoute(auth)

    const repository = new DrizzleBookRepository(db)
    const libraryRepo = new DrizzleLibraryEntryRepository(db)
    const gutendexClient = new GutendexHttpClient()

    const catalogApp = createCatalogRoute({ gutendexClient })
    const libraryApp = createLibraryRoute({
      db,
      auth,
      libraryRepo,
      concurrencyLimit: config.INGESTION_USER_CONCURRENCY_LIMIT,
      logger,
      enqueueDeps: { databaseUrl: config.DATABASE_URL },
      addBookToLibrary: (userId, gutendexId) =>
        addBookToLibrary({ repository, libraryRepo, client: gutendexClient }, userId, gutendexId),
      listLibrary: (userId, input) => listLibrary({ libraryRepo }, userId, input),
      getBook: (userId, id) => getBook({ repository, libraryRepo }, userId, id),
      removeBook: (userId, id) => removeBook({ libraryRepo }, userId, id),
      restoreBook: (userId, id) => restoreBook({ repository, libraryRepo }, userId, id),
    })

    const boot = await start({
      db,
      logger,
      routes: [
        { prefix: '/api/auth', app: authApp },
        { prefix: '/api/catalog', app: catalogApp },
        { prefix: '/api/library', app: libraryApp },
      ],
    })
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
