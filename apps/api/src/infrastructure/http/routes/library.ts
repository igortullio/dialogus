import type {
  AddBookToLibraryResult,
  Book,
  LibraryEntryRepository,
  ListLibraryInput,
  ListResult,
} from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { UnauthorizedError } from '@dialogus/shared/errors'
import { decodeCursor, encodeCursor } from '@dialogus/shared/http/cursor'
import { envelope } from '@dialogus/shared/http/envelope'
import {
  chunkReadDtoSchema,
  ingestionEnqueueResponseDtoSchema,
  ingestionStatusDtoSchema,
} from '@dialogus/shared/schemas/ingestion'
import { addBookRequestSchema, listLibraryQuerySchema } from '@dialogus/shared/schemas/library'
import { type Context, Hono } from 'hono'
import type { Logger } from 'pino'
import { z } from 'zod'
import { type GetChunkDeps, getChunk } from '../../../application/library/getChunk'
import {
  type GetIngestionStatusDeps,
  getIngestionStatus,
} from '../../../application/library/getIngestionStatus'
import { type IngestBookDeps, ingestBook } from '../../../application/library/ingest'
import { type RetryIngestBookDeps, retryIngestBook } from '../../../application/library/retryIngest'
import type { Auth } from '../../auth/auth'
import type { EnqueueDeps, enqueue } from '../../pgboss/enqueue'
import { type AuthVariables, createSessionMiddleware, requireAuth } from '../middleware/auth'
import { idempotency } from '../middleware/idempotency'

export interface LibraryRouteDeps {
  readonly db: Database
  readonly auth: Auth
  readonly libraryRepo: LibraryEntryRepository
  readonly concurrencyLimit: number
  readonly logger?: Logger
  readonly enqueueDeps: EnqueueDeps
  readonly enqueueImpl?: typeof enqueue
  readonly addBookToLibrary: (userId: string, gutendexId: number) => Promise<AddBookToLibraryResult>
  readonly listLibrary: (userId: string, input: ListLibraryInput) => Promise<ListResult>
  readonly getBook: (userId: string, id: string) => Promise<Book>
  readonly removeBook: (userId: string, id: string) => Promise<void>
  readonly restoreBook: (userId: string, id: string) => Promise<Book>
}

const idParamSchema = z.object({ id: z.uuid() })

/** Session-derived user id; `requireAuth` guarantees it is present by the handler. */
function userIdOf(c: Context<{ Variables: AuthVariables }>): string {
  const userId = c.get('userId')
  if (userId === null) throw new UnauthorizedError()
  return userId
}

function toBookDto(book: Book) {
  return {
    id: book.id,
    gutendex_id: book.gutendexId,
    title: book.title,
    authors: book.authors.map((a) => ({
      name: a.name,
      birth_year: a.birthYear,
      death_year: a.deathYear,
    })),
    languages: [...book.languages],
    subjects: [...book.subjects],
    download_url_epub: book.downloadUrlEpub,
    download_url_txt: book.downloadUrlTxt,
    cover_url: book.coverUrl,
    ingestion_status: book.ingestionStatus,
    ingestion_error: book.ingestionError,
    tags: [...book.tags],
    created_at: book.createdAt.toISOString(),
    updated_at: book.updatedAt.toISOString(),
    deleted_at: book.deletedAt ? book.deletedAt.toISOString() : null,
  }
}

export function createLibraryRoute(deps: LibraryRouteDeps): Hono {
  const app = new Hono<{ Variables: AuthVariables }>()

  // Every library endpoint is session-scoped: derive `userId` from the Better
  // Auth session, then gate (401 otherwise). Handlers read `c.get('userId')`.
  app.use('*', createSessionMiddleware(deps.auth))
  app.use('*', requireAuth())

  const ingestDeps: IngestBookDeps = {
    db: deps.db,
    libraryRepo: deps.libraryRepo,
    concurrencyLimit: deps.concurrencyLimit,
    enqueueDeps: deps.enqueueDeps,
    ...(deps.enqueueImpl ? { enqueueImpl: deps.enqueueImpl } : {}),
  }
  const retryDeps: RetryIngestBookDeps = ingestDeps
  const statusDeps: GetIngestionStatusDeps = { db: deps.db, libraryRepo: deps.libraryRepo }
  const chunkDeps: GetChunkDeps = { db: deps.db, libraryRepo: deps.libraryRepo }

  const idempotencyMiddleware = idempotency({
    db: deps.db,
    ...(deps.logger ? { logger: deps.logger } : {}),
  })

  app.post('/books', idempotencyMiddleware, async (c) => {
    const userId = userIdOf(c)
    const body = addBookRequestSchema.parse(await c.req.json())
    const { book, needsIngestion } = await deps.addBookToLibrary(userId, body.gutendex_id)
    // Auto-start ingestion only when the shared title still needs it (`discovered`).
    // Already-ingested titles are instant (SC-003/004). The deterministic
    // `ingest-{bookId}` key + the concurrency cap live inside `ingestBook`; a cap
    // hit surfaces as 429 per the contract.
    if (needsIngestion) {
      await ingestBook(ingestDeps, userId, book.id)
    }
    return c.json(envelope(toBookDto(book)), 201)
  })

  app.get('/books', async (c) => {
    const userId = userIdOf(c)
    const query = listLibraryQuerySchema.parse(c.req.query())
    const cursor = query.cursor !== undefined ? decodeCursor(query.cursor) : undefined
    const result = await deps.listLibrary(userId, {
      filter: {
        status: query.status,
        language: query.language,
        includeDeleted: query.include_deleted,
      },
      cursor,
      limit: query.limit,
    })
    const path = c.req.path
    const links: Record<string, string> = { self: path }
    if (result.nextCursor !== null) {
      links.next = `${path}?cursor=${encodeCursor(result.nextCursor)}&limit=${query.limit}`
    }
    return c.json(
      envelope(result.books.map(toBookDto), { meta: { count: result.total }, links }),
      200,
    )
  })

  app.get('/books/:id', async (c) => {
    const userId = userIdOf(c)
    const { id } = idParamSchema.parse(c.req.param())
    const book = await deps.getBook(userId, id)
    return c.json(envelope(toBookDto(book)), 200)
  })

  app.delete('/books/:id', async (c) => {
    const userId = userIdOf(c)
    const { id } = idParamSchema.parse(c.req.param())
    await deps.removeBook(userId, id)
    return new Response(null, { status: 204 })
  })

  app.post('/books/:id/restore', async (c) => {
    const userId = userIdOf(c)
    const { id } = idParamSchema.parse(c.req.param())
    const book = await deps.restoreBook(userId, id)
    return c.json(envelope(toBookDto(book)), 200)
  })

  app.post('/books/:id/ingest', idempotencyMiddleware, async (c) => {
    const userId = userIdOf(c)
    const { id } = idParamSchema.parse(c.req.param())
    const result = await ingestBook(ingestDeps, userId, id)
    return c.json(envelope(ingestionEnqueueResponseDtoSchema.parse(result)), 202)
  })

  app.post('/books/:id/ingest/retry', idempotencyMiddleware, async (c) => {
    const userId = userIdOf(c)
    const { id } = idParamSchema.parse(c.req.param())
    const result = await retryIngestBook(retryDeps, userId, id)
    return c.json(envelope(ingestionEnqueueResponseDtoSchema.parse(result)), 202)
  })

  app.get('/books/:id/ingestion', async (c) => {
    const userId = userIdOf(c)
    const { id } = idParamSchema.parse(c.req.param())
    const result = await getIngestionStatus(statusDeps, userId, id)
    return c.json(envelope(ingestionStatusDtoSchema.parse(result)), 200)
  })

  app.get('/chunks/:id', async (c) => {
    const userId = userIdOf(c)
    const { id } = idParamSchema.parse(c.req.param())
    const result = await getChunk(chunkDeps, userId, id)
    return c.json(envelope(chunkReadDtoSchema.parse(result)), 200)
  })

  // The route carries its own `AuthVariables` env for handler typing; the mount
  // (`RouteMount.app`) only needs a base Hono.
  return app as unknown as Hono
}
