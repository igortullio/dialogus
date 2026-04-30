import { createHash } from 'node:crypto'
import type { Book, ListLibraryInput, ListResult } from '@dialogus/catalog'
import { BookNotFoundError, DuplicateBookError } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { encodeCursor } from '@dialogus/shared/http/cursor'
import { PROBLEM_TYPE_PREFIX } from '@dialogus/shared/http/problem'
import { Hono } from 'hono'
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import {
  createProblemMiddleware,
  type ProblemVariables,
} from '../../src/infrastructure/http/middleware/problem'
import {
  createLibraryRoute,
  type LibraryRouteDeps,
} from '../../src/infrastructure/http/routes/library'

const BOOK_ID = '550e8400-e29b-41d4-a716-446655440000'

const SAMPLE_BOOK: Book = {
  id: BOOK_ID,
  gutendexId: 996,
  title: 'Don Quixote',
  authors: [{ name: 'Cervantes Saavedra, Miguel de', birthYear: 1547, deathYear: 1616 }],
  languages: ['en'],
  subjects: ['Knights and knighthood -- Fiction'],
  downloadUrlEpub: 'https://www.gutenberg.org/ebooks/996.epub3.images',
  downloadUrlTxt: 'https://www.gutenberg.org/files/996/996-0.txt',
  coverUrl: 'https://www.gutenberg.org/cache/epub/996/pg996.cover.medium.jpg',
  rawHash: null,
  ingestionStatus: 'discovered',
  ingestionError: null,
  tags: [],
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  deletedAt: null,
}

function makeMockDb(
  idempotencyRows: Array<{
    requestHash: string
    responseStatus: number
    responseBody: unknown
  }> = [],
): Database {
  const limit = vi.fn().mockResolvedValue(idempotencyRows)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where, limit })
  const insertValues = vi.fn().mockResolvedValue(undefined)
  const insertFn = vi.fn().mockReturnValue({ values: insertValues })
  return {
    select: vi.fn().mockReturnValue({ from }),
    insert: insertFn,
  } as unknown as Database
}

function makeDeps(overrides: Partial<LibraryRouteDeps> = {}): LibraryRouteDeps {
  return {
    db: makeMockDb(),
    enqueueDeps: { databaseUrl: 'postgres://test' },
    addBookToLibrary: vi.fn().mockResolvedValue(SAMPLE_BOOK),
    listLibrary: vi
      .fn()
      .mockResolvedValue({ books: [SAMPLE_BOOK], nextCursor: null, total: 1 } satisfies ListResult),
    getBook: vi.fn().mockResolvedValue(SAMPLE_BOOK),
    removeBook: vi.fn().mockResolvedValue(undefined),
    restoreBook: vi.fn().mockResolvedValue(SAMPLE_BOOK),
    ...overrides,
  }
}

function buildApp(deps: LibraryRouteDeps): Hono<{ Variables: ProblemVariables }> {
  const app = new Hono<{ Variables: ProblemVariables }>()
  app.use('*', createProblemMiddleware({ logger: pino({ level: 'silent' }) }))
  app.route('/library', createLibraryRoute(deps))
  return app
}

describe('POST /library/books', () => {
  it('returns 201 envelope with book data on valid body', async () => {
    const deps = makeDeps()
    const app = buildApp(deps)

    const res = await app.request('/library/books', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gutendex_id: 996 }),
    })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(201)
    const data = body.data as Record<string, unknown>
    expect(data?.id).toBe(BOOK_ID)
    expect(data?.gutendex_id).toBe(996)
    expect(data?.title).toBe('Don Quixote')
    expect(data?.ingestion_status).toBe('discovered')
    expect(data?.deleted_at).toBeNull()
    const authors = data?.authors as Array<Record<string, unknown>>
    expect(authors[0]?.birth_year).toBe(1547)
    expect(authors[0]?.death_year).toBe(1616)
    expect(vi.mocked(deps.addBookToLibrary)).toHaveBeenCalledWith(996)
  })

  it('returns 400 validation-failed for invalid body', async () => {
    const app = buildApp(makeDeps())

    const res = await app.request('/library/books', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gutendex_id: 'not-a-number' }),
    })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}validation-failed`)
    expect(body.status).toBe(400)
  })

  it('returns 409 duplicate-gutendex-id when use case throws DuplicateBookError', async () => {
    const deps = makeDeps({
      addBookToLibrary: vi
        .fn()
        .mockRejectedValue(
          new DuplicateBookError('Gutendex ID 996 already exists', { existingBookId: BOOK_ID }),
        ),
    })
    const app = buildApp(deps)

    const res = await app.request('/library/books', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gutendex_id: 996 }),
    })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(409)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}duplicate-gutendex-id`)
    expect(body.status).toBe(409)
    expect(body.existing_book_id).toBe(BOOK_ID)
  })

  it('replays 201 cached response when Idempotency-Key matches', async () => {
    const cachedBody = { data: { id: BOOK_ID, gutendex_id: 996, title: 'Don Quixote' } }
    const bodyJson = '{"gutendex_id":996}'
    const requestHash = createHash('sha256').update(bodyJson).digest('hex')
    const db = makeMockDb([{ requestHash, responseStatus: 201, responseBody: cachedBody }])
    const deps = makeDeps({ db })
    const app = buildApp(deps)

    const res = await app.request('/library/books', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': 'key-replay-1',
      },
      body: bodyJson,
    })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(201)
    expect(res.headers.get('X-Idempotency-Replay')).toBe('true')
    expect(body).toEqual(cachedBody)
    expect(vi.mocked(deps.addBookToLibrary)).not.toHaveBeenCalled()
  })
})

describe('GET /library/books', () => {
  it('returns 200 envelope with books, meta.count, and links.self', async () => {
    const app = buildApp(makeDeps())

    const res = await app.request('/library/books')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    const data = body.data as unknown[]
    expect(data).toHaveLength(1)
    const meta = body.meta as Record<string, unknown>
    expect(meta?.count).toBe(1)
    const links = body.links as Record<string, unknown>
    expect(typeof links?.self).toBe('string')
    expect(links?.next).toBeUndefined()
  })

  it('returns links.next when nextCursor is non-null', async () => {
    const nextCursor = { createdAt: new Date('2023-12-01T00:00:00.000Z'), id: BOOK_ID }
    const threeBooks = [SAMPLE_BOOK, SAMPLE_BOOK, SAMPLE_BOOK]
    const deps = makeDeps({
      listLibrary: vi.fn().mockResolvedValue({ books: threeBooks, nextCursor, total: 3 }),
    })
    const app = buildApp(deps)

    const res = await app.request('/library/books?limit=3')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    expect((body.meta as Record<string, unknown>)?.count).toBe(3)
    const links = body.links as Record<string, string>
    expect(typeof links?.next).toBe('string')
    expect(links.next).toMatch(/cursor=/)
    expect(links.next).toMatch(/limit=3/)
  })

  it('passes filter params to listLibrary', async () => {
    const deps = makeDeps()
    const app = buildApp(deps)

    await app.request('/library/books?status=discovered&language=en&include_deleted=true')

    const call = vi.mocked(deps.listLibrary).mock.calls[0]
    const input = call?.[0] as ListLibraryInput
    expect(input?.filter.status).toBe('discovered')
    expect(input?.filter.language).toBe('en')
    expect(input?.filter.includeDeleted).toBe(true)
  })

  it('returns 400 invalid-cursor for a bad cursor string', async () => {
    const app = buildApp(makeDeps())
    const badCursor = Buffer.from('not-valid-json', 'utf8').toString('base64url')

    const res = await app.request(`/library/books?cursor=${badCursor}`)
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}invalid-cursor`)
    expect(body.status).toBe(400)
  })

  it('builds valid next cursor that round-trips through encodeCursor', async () => {
    const nextCursor = { createdAt: new Date('2024-01-01T12:00:00.000Z'), id: BOOK_ID }
    const deps = makeDeps({
      listLibrary: vi.fn().mockResolvedValue({ books: [SAMPLE_BOOK], nextCursor, total: 1 }),
    })
    const app = buildApp(deps)

    const res = await app.request('/library/books')
    const body = (await res.json()) as Record<string, unknown>
    const links = body.links as Record<string, string>

    const match = links.next?.match(/cursor=([^&]+)/)
    expect(match).not.toBeNull()
    const cursorParam = match?.[1] ?? ''
    const expectedCursor = encodeCursor(nextCursor)
    expect(cursorParam).toBe(expectedCursor)
  })
})

describe('GET /library/books/:id', () => {
  it('returns 200 envelope with book data', async () => {
    const app = buildApp(makeDeps())

    const res = await app.request(`/library/books/${BOOK_ID}`)
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    const data = body.data as Record<string, unknown>
    expect(data?.id).toBe(BOOK_ID)
    expect(data?.gutendex_id).toBe(996)
  })

  it('returns 404 book-not-found when use case throws BookNotFoundError', async () => {
    const deps = makeDeps({
      getBook: vi.fn().mockRejectedValue(new BookNotFoundError(`Book ${BOOK_ID} not found`)),
    })
    const app = buildApp(deps)

    const res = await app.request(`/library/books/${BOOK_ID}`)
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}book-not-found`)
    expect(body.status).toBe(404)
  })

  it('returns 400 validation-failed for non-UUID id', async () => {
    const app = buildApp(makeDeps())

    const res = await app.request('/library/books/not-a-uuid')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}validation-failed`)
  })
})

describe('DELETE /library/books/:id', () => {
  it('returns 204 no body and calls removeBook once', async () => {
    const deps = makeDeps()
    const app = buildApp(deps)

    const res = await app.request(`/library/books/${BOOK_ID}`, { method: 'DELETE' })

    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(vi.mocked(deps.removeBook)).toHaveBeenCalledOnce()
    expect(vi.mocked(deps.removeBook)).toHaveBeenCalledWith(BOOK_ID)
  })

  it('returns 404 when removeBook throws BookNotFoundError', async () => {
    const deps = makeDeps({
      removeBook: vi.fn().mockRejectedValue(new BookNotFoundError(`Book ${BOOK_ID} not found`)),
    })
    const app = buildApp(deps)

    const res = await app.request(`/library/books/${BOOK_ID}`, { method: 'DELETE' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(404)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}book-not-found`)
  })
})

describe('POST /library/books/:id/restore', () => {
  it('returns 200 envelope with restored book and calls restoreBook once', async () => {
    const restoredBook: Book = { ...SAMPLE_BOOK, deletedAt: null }
    const deps = makeDeps({ restoreBook: vi.fn().mockResolvedValue(restoredBook) })
    const app = buildApp(deps)

    const res = await app.request(`/library/books/${BOOK_ID}/restore`, { method: 'POST' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    const data = body.data as Record<string, unknown>
    expect(data?.id).toBe(BOOK_ID)
    expect(data?.deleted_at).toBeNull()
    expect(vi.mocked(deps.restoreBook)).toHaveBeenCalledOnce()
    expect(vi.mocked(deps.restoreBook)).toHaveBeenCalledWith(BOOK_ID)
  })

  it('returns 404 when restoreBook throws BookNotFoundError', async () => {
    const deps = makeDeps({
      restoreBook: vi.fn().mockRejectedValue(new BookNotFoundError(`Book ${BOOK_ID} not found`)),
    })
    const app = buildApp(deps)

    const res = await app.request(`/library/books/${BOOK_ID}/restore`, { method: 'POST' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(404)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}book-not-found`)
  })
})
