import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDatabase, type Database } from '@dialogus/db'
import { books, chapterSummaries, chapters, chunks } from '@dialogus/db/schema'
import { MockEmbeddingProvider } from '@dialogus/ingestion/infrastructure/external/MockEmbeddingProvider'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const MIGRATIONS_FOLDER = resolve(__dirname, '../../../../../packages/db/drizzle')

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

export interface SeedBookSpec {
  readonly title: string
  readonly languages?: readonly string[]
  readonly chapterCount: number
  /** Number of chunks per chapter. */
  readonly chunksPerChapter: number
  /**
   * Optional override of the chunk text per (chapterIndex, chunkIndex).
   * `undefined` falls back to a deterministic synthesized body. The text drives
   * the embedding vector via `MockEmbeddingProvider`, so identical text across
   * a query and a chunk yields cosine similarity of 1.
   */
  readonly chunkText?: (chapterIndex: number, chunkIndex: number) => string
  readonly summarize?: boolean
}

export interface SeededBook {
  readonly bookId: string
  readonly chapterIds: string[]
  readonly chunkIds: string[][]
  readonly summaryIds: string[]
  /** Flat (chapterIndex, chunkIndex) → text used to produce the chunk's embedding. */
  readonly chunkTexts: string[][]
}

export interface SeedFixturesResult {
  readonly books: SeededBook[]
}

const embeddings = new MockEmbeddingProvider()

const DEFAULT_CHUNK_TEXT = (chapterIndex: number, chunkIndex: number) =>
  `book-chunk c${chapterIndex}-${chunkIndex} content body`

let gutendexCounter = 900_000

function nextGutendexId(): number {
  gutendexCounter += 1
  return gutendexCounter
}

async function seedBook(db: Database, spec: SeedBookSpec): Promise<SeededBook> {
  const bookId = randomUUID()
  const chunkText = spec.chunkText ?? DEFAULT_CHUNK_TEXT

  await db.insert(books).values({
    id: bookId,
    gutendexId: nextGutendexId(),
    title: spec.title,
    authors: [{ name: 'Test Author', birthYear: null, deathYear: null }],
    languages: [...(spec.languages ?? ['en'])],
    subjects: [],
    ingestionStatus: 'ready',
  })

  const chapterIds: string[] = []
  const chunkIds: string[][] = []
  const chunkTexts: string[][] = []
  const summaryIds: string[] = []

  for (let chapterIndex = 0; chapterIndex < spec.chapterCount; chapterIndex += 1) {
    const chapterId = randomUUID()
    chapterIds.push(chapterId)
    await db.insert(chapters).values({
      id: chapterId,
      bookId,
      ordinal: chapterIndex + 1,
      title: `Chapter ${chapterIndex + 1}`,
      plainText: `Plain text body of chapter ${chapterIndex + 1}.`,
      tokenCount: 100 + chapterIndex,
    })

    const chunkRowIds: string[] = []
    const chunkRowTexts: string[] = []
    const chunkBodies: string[] = []
    for (let chunkIndex = 0; chunkIndex < spec.chunksPerChapter; chunkIndex += 1) {
      const id = randomUUID()
      chunkRowIds.push(id)
      const text = chunkText(chapterIndex, chunkIndex)
      chunkRowTexts.push(text)
      chunkBodies.push(text)
    }

    const vectors = await embeddings.embed(chunkBodies)
    for (let chunkIndex = 0; chunkIndex < spec.chunksPerChapter; chunkIndex += 1) {
      const id = chunkRowIds[chunkIndex] as string
      const text = chunkRowTexts[chunkIndex] as string
      const embedding = vectors[chunkIndex] as number[]
      await db.insert(chunks).values({
        id,
        bookId,
        chapterId,
        ordinal: chunkIndex + 1,
        text,
        tokenCount: text.length,
        startChar: 0,
        endChar: text.length,
        embedding,
      })
    }
    chunkIds.push(chunkRowIds)
    chunkTexts.push(chunkRowTexts)

    if (spec.summarize) {
      const summaryId = randomUUID()
      summaryIds.push(summaryId)
      await db.insert(chapterSummaries).values({
        id: summaryId,
        chapterId,
        bookId,
        summary: `Summary of chapter ${chapterIndex + 1}.`,
        tokenCount: 25,
        model: 'mock-summary-generator',
        generatedAt: new Date('2026-04-26T12:00:00Z'),
      })
    }
  }

  return { bookId, chapterIds, chunkIds, summaryIds, chunkTexts }
}

export async function seedFixtures(
  db: Database,
  specs: readonly SeedBookSpec[],
): Promise<SeedFixturesResult> {
  const seeded: SeededBook[] = []
  for (const spec of specs) {
    seeded.push(await seedBook(db, spec))
  }
  return { books: seeded }
}

export async function clearAllSeededData(db: Database): Promise<void> {
  await db.delete(books)
}
