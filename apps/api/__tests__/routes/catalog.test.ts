import { type GutendexBook, type GutendexClient, GutendexUpstreamError } from '@dialogus/catalog'
import { PROBLEM_TYPE_PREFIX } from '@dialogus/shared/http/problem'
import { Hono } from 'hono'
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { encodeCatalogCursor } from '../../src/infrastructure/http/cursor-catalog'
import {
  createProblemMiddleware,
  type ProblemVariables,
} from '../../src/infrastructure/http/middleware/problem'
import { createCatalogRoute } from '../../src/infrastructure/http/routes/catalog'

const SAMPLE_BOOK: GutendexBook = {
  id: 996,
  title: 'Don Quixote',
  authors: [{ name: 'Cervantes Saavedra, Miguel de', birthYear: 1547, deathYear: 1616 }],
  languages: ['en'],
  subjects: ['Knights and knighthood -- Fiction'],
  downloadUrlEpub: 'https://example.com/book.epub',
  downloadUrlTxt: 'https://example.com/book.txt',
  coverUrl: 'https://example.com/cover.jpg',
}

function makeClient(overrides: Partial<GutendexClient> = {}): GutendexClient {
  return {
    search: vi.fn().mockResolvedValue({ books: [SAMPLE_BOOK], nextPage: null, count: 1 }),
    getBook: vi.fn().mockResolvedValue(SAMPLE_BOOK),
    ...overrides,
  }
}

function buildApp(client: GutendexClient): Hono<{ Variables: ProblemVariables }> {
  const app = new Hono<{ Variables: ProblemVariables }>()
  app.use('*', createProblemMiddleware({ logger: pino({ level: 'silent' }) }))
  app.route('/catalog', createCatalogRoute({ gutendexClient: client }))
  return app
}

describe('GET /catalog/search', () => {
  it('returns 200 envelope with books, meta.count, and links.self', async () => {
    const app = buildApp(makeClient())

    const res = await app.request('/catalog/search?q=Moby+Dick&language=en')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    const data = body.data as Array<Record<string, unknown>>
    expect(data).toHaveLength(1)
    expect(data[0]?.id).toBe(996)
    expect(data[0]?.title).toBe('Don Quixote')
    expect((body.meta as Record<string, unknown>)?.count).toBe(1)
    const links = body.links as Record<string, unknown>
    expect(typeof links?.self).toBe('string')
    expect(links?.next).toBeUndefined()
  })

  it('returns links.next cursor when client reports a next page', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue({
        books: [SAMPLE_BOOK],
        nextPage: 'https://gutendex.com/books?page=2',
        count: 76,
      }),
    })
    const app = buildApp(client)

    const res = await app.request('/catalog/search?q=Don+Quixote')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    expect((body.meta as Record<string, unknown>)?.count).toBe(76)
    const links = body.links as Record<string, string>
    expect(typeof links?.next).toBe('string')
    expect(links.next).toMatch(/cursor=/)
  })

  it('returns 400 validation-failed for unrecognised language code', async () => {
    const app = buildApp(makeClient())

    const res = await app.request('/catalog/search?language=xx')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}validation-failed`)
    expect(body.status).toBe(400)
  })

  it('decodes a valid cursor and forwards the page number to the client', async () => {
    const client = makeClient()
    const app = buildApp(client)
    const cursor = encodeCatalogCursor('https://gutendex.com/books?page=3&search=test')

    const res = await app.request(`/catalog/search?q=test&cursor=${cursor}`)
    expect(res.status).toBe(200)
    const searchFn = client.search as ReturnType<typeof vi.fn>
    expect(searchFn).toHaveBeenCalledWith(expect.objectContaining({ page: 3 }))
  })

  it('returns 400 invalid-cursor for a cursor that does not decode to a valid URL', async () => {
    const app = buildApp(makeClient())
    const badCursor = Buffer.from('not-a-valid-url', 'utf8').toString('base64url')

    const res = await app.request(`/catalog/search?cursor=${badCursor}`)
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}invalid-cursor`)
    expect(body.status).toBe(400)
  })

  it('returns 503 gutendex-upstream-error with retry-after when client throws', async () => {
    const client = makeClient({
      search: vi.fn().mockRejectedValue(new GutendexUpstreamError(503, 'timeout')),
    })
    const app = buildApp(client)

    const res = await app.request('/catalog/search?q=test')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(503)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}gutendex-upstream-error`)
    expect(body.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('60')
  })
})

describe('GET /catalog/books/:gutendex_id', () => {
  it('returns 200 envelope with book data in snake_case wire format', async () => {
    const app = buildApp(makeClient())

    const res = await app.request('/catalog/books/996')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    const data = body.data as Record<string, unknown>
    expect(data?.id).toBe(996)
    expect(data?.title).toBe('Don Quixote')
    expect(data?.download_url_epub).toBe('https://example.com/book.epub')
    expect(data?.cover_url).toBe('https://example.com/cover.jpg')
    const authors = data?.authors as Array<Record<string, unknown>>
    expect(authors[0]?.birth_year).toBe(1547)
    expect(authors[0]?.death_year).toBe(1616)
  })

  it('returns 400 validation-failed for non-numeric gutendex_id', async () => {
    const app = buildApp(makeClient())

    const res = await app.request('/catalog/books/abc')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}validation-failed`)
    expect(body.status).toBe(400)
  })

  it('returns 503 gutendex-upstream-error with retry-after when client throws', async () => {
    const client = makeClient({
      getBook: vi.fn().mockRejectedValue(new GutendexUpstreamError(503, 'timeout')),
    })
    const app = buildApp(client)

    const res = await app.request('/catalog/books/996')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(503)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}gutendex-upstream-error`)
    expect(body.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('60')
  })
})
