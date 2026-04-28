import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  BOOK_996,
  FIXTURE_BASE_URL,
  fiveHundredHandler,
  fourHundredHandler,
  happyPathHandlers,
  networkErrorHandler,
  SEARCH_DON_QUIXOTE,
  SEARCH_MACHADO,
  validationFailureHandler,
} from '../../../__fixtures__/gutendex/handlers'
import { GutendexUpstreamError, GutendexValidationError } from '../../../src/domain/book/BookError'
import { GutendexHttpClient } from '../../../src/infrastructure/external/GutendexHttpClient'

const server = setupServer(...happyPathHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers(...happyPathHandlers))
afterAll(() => server.close())

function makeClient(
  overrides: ConstructorParameters<typeof GutendexHttpClient>[0] = {},
): GutendexHttpClient {
  return new GutendexHttpClient({
    baseUrl: FIXTURE_BASE_URL,
    retryBaseDelayMs: 1,
    sleep: async () => {},
    ...overrides,
  })
}

const dqResults = SEARCH_DON_QUIXOTE.results as Array<Record<string, unknown>>
const [dqFirstFixture] = dqResults as [Record<string, unknown>]
const dqFirstFormats = dqFirstFixture.formats as Record<string, string>

describe('GutendexHttpClient.search — cache miss', () => {
  it('hits MSW and returns the camelCase-mapped fixture shape', async () => {
    const client = makeClient()
    const result = await client.search({ q: 'Don Quixote' })

    expect(result.count).toBe(SEARCH_DON_QUIXOTE.count)
    expect(result.nextPage).toBe(SEARCH_DON_QUIXOTE.next)
    expect(result.books).toHaveLength(dqResults.length)
    const [first] = result.books
    if (!first) throw new Error('expected at least one book in result')
    expect(first.id).toBe(dqFirstFixture.id)
    expect(first.title).toBe(dqFirstFixture.title)
    expect(first.languages).toEqual(dqFirstFixture.languages)
    expect(first.downloadUrlEpub).toBe(dqFirstFormats['application/epub+zip'])
    expect(first.downloadUrlTxt).toBe(dqFirstFormats['text/plain; charset=utf-8'])
    expect(first.coverUrl).toBe(dqFirstFormats['image/jpeg'])
    const [firstAuthor] = first.authors
    expect(firstAuthor).toEqual({
      name: 'Cervantes Saavedra, Miguel de',
      birthYear: 1547,
      deathYear: 1616,
    })
  })
})

describe('GutendexHttpClient.search — cache hit', () => {
  it('does not re-issue the network request on identical second call', async () => {
    let networkCalls = 0
    server.use(
      http.get(`${FIXTURE_BASE_URL}/books`, () => {
        networkCalls += 1
        return HttpResponse.json(SEARCH_DON_QUIXOTE)
      }),
    )

    const client = makeClient()
    await client.search({ q: 'Don Quixote' })
    await client.search({ q: 'Don Quixote' })

    expect(networkCalls).toBe(1)
  })
})

describe('GutendexHttpClient.search — cache key normalization', () => {
  it('different `q` values produce different cache entries', async () => {
    let networkCalls = 0
    server.use(
      http.get(`${FIXTURE_BASE_URL}/books`, () => {
        networkCalls += 1
        return HttpResponse.json(SEARCH_DON_QUIXOTE)
      }),
    )

    const client = makeClient()
    await client.search({ q: 'A' })
    await client.search({ q: 'B' })

    expect(networkCalls).toBe(2)
  })

  it('reordered language arrays hit the same cache entry after alphabetical sort', async () => {
    let networkCalls = 0
    server.use(
      http.get(`${FIXTURE_BASE_URL}/books`, () => {
        networkCalls += 1
        return HttpResponse.json(SEARCH_DON_QUIXOTE)
      }),
    )

    const client = makeClient()
    await client.search({ q: 'X', languages: ['en', 'pt'] })
    await client.search({ q: 'X', languages: ['pt', 'en'] })

    expect(networkCalls).toBe(1)
  })
})

describe('GutendexHttpClient.search — TTL eviction', () => {
  it('refetches after the configured TTL elapses', async () => {
    let networkCalls = 0
    server.use(
      http.get(`${FIXTURE_BASE_URL}/books`, () => {
        networkCalls += 1
        return HttpResponse.json(SEARCH_DON_QUIXOTE)
      }),
    )

    const client = makeClient({ cacheTtlMs: 25 })
    await client.search({ q: 'Don Quixote' })
    expect(networkCalls).toBe(1)

    await new Promise((resolve) => setTimeout(resolve, 60))

    await client.search({ q: 'Don Quixote' })
    expect(networkCalls).toBe(2)
  })
})

describe('GutendexHttpClient.search — Zod .strip() tolerance', () => {
  it('parses successfully when responses include unknown fields', async () => {
    const augmentedResults = dqResults.map((book) => ({ ...book, unknown_field: 'ignore-me' }))
    server.use(
      http.get(`${FIXTURE_BASE_URL}/books`, () =>
        HttpResponse.json({
          ...SEARCH_DON_QUIXOTE,
          extra_envelope_field: 42,
          results: augmentedResults,
        }),
      ),
    )

    const client = makeClient()
    const result = await client.search({ q: 'Don Quixote' })
    expect(result.books).toHaveLength(augmentedResults.length)
    const [first] = result.books
    expect(first).not.toHaveProperty('unknown_field')
  })
})

describe('GutendexHttpClient.search — validation failure', () => {
  it('throws GutendexValidationError when a required field is missing', async () => {
    server.use(validationFailureHandler())

    const client = makeClient()
    await expect(client.search({ q: 'broken' })).rejects.toBeInstanceOf(GutendexValidationError)
  })

  it('attaches Zod issues describing the missing field', async () => {
    server.use(validationFailureHandler())

    const client = makeClient()
    const error = await client.search({ q: 'broken' }).catch((err) => err)
    expect(error).toBeInstanceOf(GutendexValidationError)
    const validationError = error as GutendexValidationError
    expect(validationError.code).toBe('GUTENDEX_VALIDATION_FAILED')
    expect(validationError.issues.some((issue) => issue.path.endsWith('title'))).toBe(true)
  })
})

describe('GutendexHttpClient.search — 5xx with retry', () => {
  it('retries once after retryBaseDelayMs and then throws GutendexUpstreamError', async () => {
    let calls = 0
    server.use(
      http.get(`${FIXTURE_BASE_URL}/books`, () => {
        calls += 1
        return HttpResponse.json({ detail: 'upstream' }, { status: 503 })
      }),
    )

    const sleepDurations: number[] = []
    const client = makeClient({
      retryBaseDelayMs: 500,
      sleep: async (ms) => {
        sleepDurations.push(ms)
      },
    })

    const error = await client.search({ q: 'flaky' }).catch((err) => err)
    expect(error).toBeInstanceOf(GutendexUpstreamError)
    expect((error as GutendexUpstreamError).upstreamStatus).toBe(503)
    expect(calls).toBe(2)
    expect(sleepDurations).toEqual([500])
  })

  it('recovers when 5xx is followed by a success on retry', async () => {
    let calls = 0
    server.use(
      http.get(`${FIXTURE_BASE_URL}/books`, () => {
        calls += 1
        if (calls === 1) {
          return HttpResponse.json({ detail: 'upstream' }, { status: 503 })
        }
        return HttpResponse.json(SEARCH_DON_QUIXOTE)
      }),
    )

    const client = makeClient()
    const result = await client.search({ q: 'flaky' })
    expect(result.count).toBe(SEARCH_DON_QUIXOTE.count)
    expect(calls).toBe(2)
  })
})

describe('GutendexHttpClient.getBook — 4xx without retry', () => {
  it('throws GutendexUpstreamError on 404 without retrying', async () => {
    let calls = 0
    server.use(
      http.get(`${FIXTURE_BASE_URL}/books/777`, () => {
        calls += 1
        return HttpResponse.json({ detail: 'not found' }, { status: 404 })
      }),
    )

    const client = makeClient()
    const error = await client.getBook(777).catch((err) => err)
    expect(error).toBeInstanceOf(GutendexUpstreamError)
    expect((error as GutendexUpstreamError).upstreamStatus).toBe(404)
    expect(calls).toBe(1)
  })
})

describe('GutendexHttpClient.search — network error retry', () => {
  it('retries once on fetch errors, then throws GutendexUpstreamError', async () => {
    let calls = 0
    server.use(
      http.get(`${FIXTURE_BASE_URL}/books`, () => {
        calls += 1
        return HttpResponse.error()
      }),
    )

    const sleepDurations: number[] = []
    const client = makeClient({
      retryBaseDelayMs: 500,
      sleep: async (ms) => {
        sleepDurations.push(ms)
      },
    })

    const error = await client.search({ q: 'flaky' }).catch((err) => err)
    expect(error).toBeInstanceOf(GutendexUpstreamError)
    expect((error as GutendexUpstreamError).upstreamStatus).toBeNull()
    expect(calls).toBe(2)
    expect(sleepDurations).toEqual([500])
  })

  it('reuses the network-error MSW helper to assemble the failure path', async () => {
    server.use(networkErrorHandler())
    const client = makeClient()
    await expect(client.search({ q: 'flaky' })).rejects.toBeInstanceOf(GutendexUpstreamError)
  })
})

describe('GutendexHttpClient — fixture handler helpers', () => {
  it('SEARCH_MACHADO fixture is served when query mentions Machado', async () => {
    const client = makeClient()
    const result = await client.search({ q: 'Machado' })
    expect(result.count).toBe(SEARCH_MACHADO.count)
    const [first] = result.books
    expect(first?.languages).toEqual(['pt'])
  })

  it('fiveHundredHandler returns 503 for /books and triggers a retry path', async () => {
    server.use(fiveHundredHandler())
    const client = makeClient()
    await expect(client.search({ q: 'flaky' })).rejects.toBeInstanceOf(GutendexUpstreamError)
  })

  it('fourHundredHandler returns 404 for the targeted book id', async () => {
    server.use(fourHundredHandler(404))
    const client = makeClient()
    await expect(client.getBook(404)).rejects.toBeInstanceOf(GutendexUpstreamError)
  })
})

describe('GutendexHttpClient.getBook — happy path + URL', () => {
  it('issues GET /books/996 and returns the camelCase-mapped detail', async () => {
    const observedPaths: string[] = []
    server.use(
      http.get(`${FIXTURE_BASE_URL}/books/:id`, ({ request, params }) => {
        observedPaths.push(new URL(request.url).pathname)
        if (params.id === '996') return HttpResponse.json(BOOK_996)
        return HttpResponse.json({ detail: 'not found' }, { status: 404 })
      }),
    )

    const client = makeClient()
    const book = await client.getBook(996)

    expect(observedPaths).toEqual(['/books/996'])
    expect(book.id).toBe(996)
    expect(book.title).toBe('Don Quixote')
    expect(book.coverUrl).toBe('https://www.gutenberg.org/cache/epub/996/pg996.cover.medium.jpg')
    expect(book.downloadUrlEpub).toBe('https://www.gutenberg.org/ebooks/996.epub3.images')
    expect(book.downloadUrlTxt).toBe('https://www.gutenberg.org/files/996/996-0.txt')
  })

  it('caches the second getBook call', async () => {
    let calls = 0
    server.use(
      http.get(`${FIXTURE_BASE_URL}/books/996`, () => {
        calls += 1
        return HttpResponse.json(BOOK_996)
      }),
    )

    const client = makeClient()
    await client.getBook(996)
    await client.getBook(996)
    expect(calls).toBe(1)
  })
})

describe('GutendexHttpClient — defaults', () => {
  it('uses https://gutendex.com when no baseUrl is provided', async () => {
    const observedUrls: string[] = []
    const fakeFetch: typeof fetch = async (input) => {
      observedUrls.push(input.toString())
      return new Response(JSON.stringify(SEARCH_DON_QUIXOTE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    const client = new GutendexHttpClient({ fetchImpl: fakeFetch })
    await client.search({ q: 'Don Quixote' })
    const [firstObserved] = observedUrls
    expect(firstObserved).toMatch(/^https:\/\/gutendex\.com\/books\?/)
  })

  it('respects the configured retry budget when both attempts fail', async () => {
    const sleepCalls: number[] = []
    const fakeFetch: typeof fetch = vi.fn(async () => {
      throw new TypeError('boom')
    }) as unknown as typeof fetch
    const client = new GutendexHttpClient({
      baseUrl: FIXTURE_BASE_URL,
      fetchImpl: fakeFetch,
      retryBaseDelayMs: 100,
      sleep: async (ms) => {
        sleepCalls.push(ms)
      },
    })
    await expect(client.search({ q: 'oops' })).rejects.toBeInstanceOf(GutendexUpstreamError)
    expect(sleepCalls).toEqual([100])
  })
})
