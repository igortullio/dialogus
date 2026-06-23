import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDatabase, createPgBoss, type Database } from '@dialogus/db'
import { books, libraryEntries, user } from '@dialogus/db/schema'
import type { ChapterSummaryGenerator, EmbeddingProvider } from '@dialogus/ingestion'
import type { StageDeps } from '@dialogus/ingestion/application/stages/_common'
import { MockChapterSummaryGenerator } from '@dialogus/ingestion/infrastructure/external/MockChapterSummaryGenerator'
import { MockEmbeddingProvider } from '@dialogus/ingestion/infrastructure/external/MockEmbeddingProvider'
import {
  attachSignalHandlers,
  start as startWorker,
  type BootResult as WorkerBootResult,
  type StartOptions as WorkerStartOptions,
} from '@dialogus/worker'
import { type ComposedStageDeps, composeStageDeps } from '@dialogus/worker/deps'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import type { Logger } from 'pino'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const MIGRATIONS_FOLDER = resolve(__dirname, '../../../../../packages/db/drizzle')

export const dockerAvailable =
  spawnSync('docker', ['info', '--format', '{{.ServerVersion}}']).status === 0

export interface PostgresContext {
  readonly container: StartedPostgreSqlContainer
  readonly databaseUrl: string
  readonly db: Database
}

export async function startPostgres(): Promise<PostgresContext> {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
    .withDatabase('test')
    .withUsername('test')
    .withPassword('test')
    .start()
  const databaseUrl = container.getConnectionUri()
  const db = createDatabase(databaseUrl)
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  return { container, databaseUrl, db }
}

export async function stopPostgres(ctx: PostgresContext): Promise<void> {
  const client = (
    ctx.db as unknown as { $client?: { end: (opts?: { timeout?: number }) => Promise<void> } }
  ).$client
  if (client) await client.end({ timeout: 5 })
  await ctx.container.stop()
}

export interface BookFixtureInput {
  readonly gutendexId: number
  readonly title?: string
  readonly authorName?: string
  readonly languages?: readonly string[]
  readonly downloadUrlEpub?: string | null
  readonly downloadUrlTxt?: string | null
  readonly rawHash?: string | null
}

export async function insertDiscoveredBook(db: Database, input: BookFixtureInput): Promise<string> {
  const [row] = await db
    .insert(books)
    .values({
      gutendexId: input.gutendexId,
      title: input.title ?? `Test Book ${input.gutendexId}`,
      authors: [
        {
          name: input.authorName ?? 'Test Author',
          birthYear: null,
          deathYear: null,
        },
      ],
      languages: [...(input.languages ?? ['en'])],
      subjects: [],
      downloadUrlEpub: input.downloadUrlEpub ?? null,
      downloadUrlTxt: input.downloadUrlTxt ?? null,
      rawHash: input.rawHash ?? null,
      ingestionStatus: 'discovered',
    })
    .returning({ id: books.id })
  if (!row) throw new Error('failed to insert fixture book')
  return row.id
}

/**
 * Insert a real `user` row (Better Auth's table) so `library_entries`/membership
 * FK inserts succeed. Returns the user id. Pair with `fakeAuth(userId)` from
 * `__tests__/_helpers/auth` to drive the library route as that user.
 */
export async function createTestUser(
  db: Database,
  overrides: { id?: string; email?: string; name?: string; role?: string } = {},
): Promise<string> {
  const id = overrides.id ?? `user-${randomUUID()}`
  await db.insert(user).values({
    id,
    name: overrides.name ?? 'Test User',
    email: overrides.email ?? `${id}@test.local`,
    emailVerified: true,
    role: overrides.role ?? 'member',
  })
  return id
}

/** Give a user an active membership over a shared book (FR-007). */
export async function addLibraryMembership(
  db: Database,
  userId: string,
  bookId: string,
): Promise<void> {
  await db.insert(libraryEntries).values({ userId, bookId })
}

export async function readBookRow(db: Database, bookId: string) {
  const row = await db.query.books.findFirst({ where: eq(books.id, bookId) })
  if (!row) throw new Error(`book ${bookId} not found`)
  return row
}

export interface WaitForBookStatusOptions {
  /**
   * When true, do not short-circuit if the row is currently in 'failed' state — useful
   * for retry suites that explicitly start from 'failed' and wait for the worker to
   * transition through 'embedding' → 'indexing' → 'ready'.
   */
  readonly allowFailed?: boolean
}

export async function waitForBookStatus(
  db: Database,
  bookId: string,
  target: 'ready' | 'failed',
  timeoutMs: number,
  options: WaitForBookStatusOptions = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const row = await db.query.books.findFirst({
      where: eq(books.id, bookId),
      columns: { ingestionStatus: true },
    })
    if (row?.ingestionStatus === target) return
    if (target === 'ready' && row?.ingestionStatus === 'failed' && options.allowFailed !== true) {
      throw new Error(`book ${bookId} reached 'failed' while waiting for 'ready'`)
    }
    await sleep(150)
  }
  throw new Error(`timeout (${timeoutMs}ms) waiting for book ${bookId} to reach ${target}`)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface StartedWorker {
  readonly boot: WorkerBootResult
  readonly detachSignals: () => void
}

export interface StartWorkerOptions {
  readonly databaseUrl: string
  readonly storageRoot: string
  readonly logger: Logger
  readonly embeddingProvider?: EmbeddingProvider
  readonly chapterSummaryGenerator?: ChapterSummaryGenerator
}

const ORIGINAL_ENV: NodeJS.ProcessEnv = { ...process.env }

export function applyTestEnv(databaseUrl: string): void {
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = databaseUrl
  process.env.LOG_LEVEL = 'error'
  process.env.API_PORT = '0'
  process.env.WEB_PORT = '0'
  delete process.env.EMBEDDING_PROVIDER
  delete process.env.OPENAI_API_KEY
  delete process.env.SUMMARY_GENERATOR
  delete process.env.ANTHROPIC_API_KEY
}

export function restoreEnv(): void {
  process.env = { ...ORIGINAL_ENV }
}

export async function startTestWorker(options: StartWorkerOptions): Promise<StartedWorker> {
  applyTestEnv(options.databaseUrl)
  const provider = options.embeddingProvider ?? new MockEmbeddingProvider()
  const summaryGenerator = options.chapterSummaryGenerator ?? new MockChapterSummaryGenerator()
  const composeDeps: WorkerStartOptions['composeDeps'] = (input) => {
    const composed = composeStageDeps({ ...input, storageRoot: options.storageRoot })
    const overridden: ComposedStageDeps = {
      ...composed,
      deps: {
        ...(composed.deps as StageDeps),
        embeddingProvider: provider,
      } as StageDeps,
      embeddingProvider: {
        provider,
        choice: 'mock',
        source: 'default',
      },
      chapterSummaryGenerator: summaryGenerator,
      summaryGenerator: {
        generator: summaryGenerator,
        choice: 'mock',
        source: 'default',
        modelName: 'mock-summary-generator',
      },
    }
    return overridden
  }
  const boot = await startWorker({ logger: options.logger, composeDeps })
  let exited = false
  const detachSignals = attachSignalHandlers(boot, () => {
    exited = true
  })
  if (exited) {
    /* satisfy lint — the flag is only meaningful if a signal was emitted */
  }
  return { boot, detachSignals }
}

export async function stopTestWorker(worker: StartedWorker): Promise<void> {
  worker.detachSignals()
  await worker.boot.shutdown()
}

export interface DirectEnqueueDeps {
  readonly databaseUrl: string
}

export async function directEnqueue(
  deps: DirectEnqueueDeps,
  queue: string,
  data: object,
): Promise<string> {
  const boss = createPgBoss(deps.databaseUrl)
  await boss.start()
  try {
    const id = await boss.send(queue, data)
    if (id == null) throw new Error(`pg-boss returned null jobId for ${queue}`)
    return id
  } finally {
    await boss.stop({ graceful: false })
  }
}

export interface MemorySnapshot {
  readonly heapUsedMB: number
  readonly rssMB: number
}

export function captureMemory(): MemorySnapshot {
  const m = process.memoryUsage()
  return {
    heapUsedMB: m.heapUsed / 1024 / 1024,
    rssMB: m.rss / 1024 / 1024,
  }
}
