import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Book } from '@dialogus/catalog'
import { getBook, listLibrary, removeBook, restoreBook } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { createDatabase } from '@dialogus/db'
import { books, idempotencyKeys } from '@dialogus/db/schema'
import { decodeCursor } from '@dialogus/shared/http/cursor'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { Hono } from 'hono'
import { pino } from 'pino'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DrizzleBookRepository } from '../../../../packages/catalog/src/infrastructure/persistence/DrizzleBookRepository'
import {
  createProblemMiddleware,
  type ProblemVariables,
} from '../../src/infrastructure/http/middleware/problem'
import { createLibraryRoute } from '../../src/infrastructure/http/routes/library'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../../../../packages/db/drizzle')

const dockerAvailable = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}']).status === 0

function buildApp(db: Database): {
  app: Hono<{ Variables: ProblemVariables }>
  bookRepository: DrizzleBookRepository
} {
  const bookRepository = new DrizzleBookRepository(db)
  const app = new Hono<{ Variables: ProblemVariables }>()
  app.use('*', createProblemMiddleware({ logger: pino({ level: 'silent' }) }))
  app.route(
    '/api/library',
    createLibraryRoute({
      db,
      enqueueDeps: { databaseUrl: 'postgres://test' },
      addBookToLibrary: async () => {
        throw new Error('not used in cursor tests')
      },
      listLibrary: (input) => listLibrary({ repository: bookRepository }, input),
      getBook: (id) => getBook({ repository: bookRepository }, id),
      removeBook: (id) => removeBook({ repository: bookRepository }, id),
      restoreBook: (id) => restoreBook({ repository: bookRepository }, id),
    }),
  )
  return { app, bookRepository }
}

function makeBook(overrides: Partial<Book> = {}): Book {
  const now = new Date()
  return {
    id: randomUUID(),
    gutendexId: Math.floor(Math.random() * 1_000_000),
    title: 'Test Book',
    authors: [{ name: 'Test Author', birthYear: 1900, deathYear: 1980 }],
    languages: ['en'],
    subjects: [],
    downloadUrlEpub: null,
    downloadUrlTxt: null,
    coverUrl: null,
    rawHash: null,
    ingestionStatus: 'discovered',
    ingestionError: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  }
}

describe.skipIf(!dockerAvailable)('Cursor pagination (Testcontainers)', () => {
  let container: StartedPostgreSqlContainer
  let db: Database
  let app: Hono<{ Variables: ProblemVariables }>
  let bookRepository: DrizzleBookRepository

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
      .withDatabase('test')
      .withUsername('test')
      .withPassword('test')
      .start()
    db = createDatabase(container.getConnectionUri())
    await migrate(db, { migrationsFolder })
    ;({ app, bookRepository } = buildApp(db))
  }, 180_000)

  afterAll(async () => {
    const client = (
      db as unknown as { $client?: { end: (opts?: { timeout?: number }) => Promise<void> } }
    ).$client
    if (client) await client.end({ timeout: 5 })
    if (container) await container.stop()
  })

  beforeEach(async () => {
    await db.delete(idempotencyKeys)
    await db.delete(books)
  })

  async function insertBooks(count: number, baseTime: Date): Promise<Book[]> {
    const inserted: Book[] = []
    for (let i = 0; i < count; i++) {
      const createdAt = new Date(baseTime.getTime() - i * 1000)
      const book = makeBook({ createdAt, updatedAt: createdAt })
      const saved = await bookRepository.save(book)
      inserted.push(saved)
    }
    return inserted
  }

  it('paginates 50 books across 3 pages with no duplicates and no gaps', async () => {
    const baseTime = new Date('2025-01-01T12:00:00.000Z')
    await insertBooks(50, baseTime)

    // Page 1 — limit=20
    const page1Res = await app.request('/api/library/books?limit=20')
    const page1Body = (await page1Res.json()) as Record<string, unknown>
    expect(page1Res.status).toBe(200)

    const page1Data = page1Body.data as Array<Record<string, unknown>>
    expect(page1Data.length).toBe(20)

    const page1Links = page1Body.links as Record<string, string>
    expect(typeof page1Links?.next).toBe('string')

    // Extract cursor from next link
    const nextMatch1 = page1Links.next.match(/cursor=([^&]+)/)
    expect(nextMatch1).not.toBeNull()
    const cursor1 = nextMatch1?.[1] ?? ''

    // Page 2 — limit=20
    const page2Res = await app.request(`/api/library/books?cursor=${cursor1}&limit=20`)
    const page2Body = (await page2Res.json()) as Record<string, unknown>
    expect(page2Res.status).toBe(200)

    const page2Data = page2Body.data as Array<Record<string, unknown>>
    expect(page2Data.length).toBe(20)

    const page2Links = page2Body.links as Record<string, string>
    expect(typeof page2Links?.next).toBe('string')

    const nextMatch2 = page2Links.next.match(/cursor=([^&]+)/)
    expect(nextMatch2).not.toBeNull()
    const cursor2 = nextMatch2?.[1] ?? ''

    // Page 3 — limit=20 → only 10 remaining
    const page3Res = await app.request(`/api/library/books?cursor=${cursor2}&limit=20`)
    const page3Body = (await page3Res.json()) as Record<string, unknown>
    expect(page3Res.status).toBe(200)

    const page3Data = page3Body.data as Array<Record<string, unknown>>
    expect(page3Data.length).toBe(10)

    // No next link on last page
    const page3Links = page3Body.links as Record<string, string>
    expect(page3Links?.next).toBeUndefined()

    // Merge all pages and verify uniqueness + total count
    const allItems = [...page1Data, ...page2Data, ...page3Data]
    expect(allItems.length).toBe(50)

    const ids = allItems.map((item) => item.id as string)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(50)

    // Verify descending created_at order (no gaps or reversals across pages)
    const createdAts = allItems.map((item) => new Date(item.created_at as string).getTime())
    for (let i = 1; i < createdAts.length; i++) {
      const prev = createdAts[i - 1]
      const curr = createdAts[i]
      expect(prev).toBeGreaterThanOrEqual(curr ?? 0)
    }
  })

  it('mid-pagination insert: new book does not appear on page 2 after cursor from page 1', async () => {
    const baseTime = new Date('2025-06-01T00:00:00.000Z')
    await insertBooks(30, baseTime)

    // Page 1 — limit=20
    const page1Res = await app.request('/api/library/books?limit=20')
    const page1Body = (await page1Res.json()) as Record<string, unknown>
    expect(page1Res.status).toBe(200)

    const page1Links = page1Body.links as Record<string, string>
    const nextMatch = page1Links.next?.match(/cursor=([^&]+)/)
    expect(nextMatch).not.toBeNull()
    const cursor = nextMatch?.[1] ?? ''

    // Verify cursor decodes to a valid position
    const position = decodeCursor(cursor)
    expect(position.createdAt).toBeInstanceOf(Date)

    // Insert a new book AFTER getting the page 1 cursor — it has a newer createdAt
    const newBook = makeBook({
      createdAt: new Date(baseTime.getTime() + 60_000),
      updatedAt: new Date(baseTime.getTime() + 60_000),
    })
    await bookRepository.save(newBook)

    // Page 2 — new book should NOT appear
    const page2Res = await app.request(`/api/library/books?cursor=${cursor}&limit=20`)
    const page2Body = (await page2Res.json()) as Record<string, unknown>
    expect(page2Res.status).toBe(200)

    const page2Data = page2Body.data as Array<Record<string, unknown>>
    const page2Ids = page2Data.map((item) => item.id as string)
    expect(page2Ids).not.toContain(newBook.id)

    // The 10 remaining books appear on page 2 (30 total - 20 on page 1)
    expect(page2Data.length).toBe(10)
  })
})
