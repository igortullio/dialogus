import { gutendexBookSchema } from '@dialogus/shared/schemas/book'
import { LRUCache } from 'lru-cache'
import { type ZodError, z } from 'zod'
import { GutendexUpstreamError, GutendexValidationError } from '../../domain/book/BookError'
import type {
  GutendexBook,
  GutendexClient,
  GutendexSearchQuery,
  GutendexSearchResult,
} from '../../domain/book/GutendexClient.port'

const DEFAULT_BASE_URL = 'https://gutendex.com'
const DEFAULT_CACHE_MAX = 500
const DEFAULT_CACHE_TTL_MS = 60_000
const DEFAULT_MAX_RETRIES = 1
const DEFAULT_RETRY_BASE_DELAY_MS = 500

const searchEnvelopeSchema = z
  .object({
    count: z.number().int().nonnegative(),
    next: z.string().url().nullable(),
    previous: z.string().url().nullable().optional(),
    results: z.array(gutendexBookSchema),
  })
  .strip()

const bookSchema = gutendexBookSchema.strip()

type CacheValue = GutendexSearchResult | GutendexBook

export interface GutendexHttpClientOptions {
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
  readonly cache?: LRUCache<string, CacheValue>
  readonly cacheMax?: number
  readonly cacheTtlMs?: number
  readonly maxRetries?: number
  readonly retryBaseDelayMs?: number
  readonly sleep?: (ms: number) => Promise<void>
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sortedQueryString(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '')
    .sort((a, b) => a[0].localeCompare(b[0]))
  if (entries.length === 0) return ''
  const search = new URLSearchParams()
  for (const [key, value] of entries) search.append(key, value)
  return search.toString()
}

function cacheKey(method: string, path: string, query: string): string {
  return query.length > 0 ? `${method} ${path}?${query}` : `${method} ${path}`
}

function zodErrorToIssues(err: ZodError): { path: string; message: string }[] {
  return err.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join('.'),
    message: issue.message,
  }))
}

function mapBookFromValidated(book: z.infer<typeof gutendexBookSchema>): GutendexBook {
  const formats = book.formats
  const txt =
    formats['text/plain; charset=utf-8'] ??
    formats['text/plain; charset=us-ascii'] ??
    formats['text/plain'] ??
    null
  return {
    id: book.id,
    title: book.title,
    authors: book.authors.map((author) => ({
      name: author.name,
      birthYear: author.birth_year,
      deathYear: author.death_year,
    })),
    languages: [...book.languages],
    subjects: [...book.subjects],
    downloadUrlEpub: formats['application/epub+zip'] ?? null,
    downloadUrlTxt: txt,
    coverUrl: formats['image/jpeg'] ?? null,
  }
}

export class GutendexHttpClient implements GutendexClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly cache: LRUCache<string, CacheValue>
  private readonly maxRetries: number
  private readonly retryBaseDelayMs: number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: GutendexHttpClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
    this.cache =
      options.cache ??
      new LRUCache<string, CacheValue>({
        max: options.cacheMax ?? DEFAULT_CACHE_MAX,
        ttl: options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
      })
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS
    this.sleep = options.sleep ?? defaultSleep
  }

  async search(query: GutendexSearchQuery): Promise<GutendexSearchResult> {
    const queryString = sortedQueryString(toSearchParams(query))
    const key = cacheKey('GET', '/books', queryString)
    const cached = this.cache.get(key)
    if (cached !== undefined && 'books' in cached) return cached

    const url =
      queryString.length > 0 ? `${this.baseUrl}/books?${queryString}` : `${this.baseUrl}/books`
    const json = await this.fetchJson(url)
    const parsed = parseOrThrow(searchEnvelopeSchema, json, `GET /books?${queryString}`)
    const result: GutendexSearchResult = {
      books: parsed.results.map(mapBookFromValidated),
      nextPage: parsed.next,
      count: parsed.count,
    }
    this.cache.set(key, result)
    return result
  }

  async getBook(gutendexId: number): Promise<GutendexBook> {
    const path = `/books/${gutendexId}`
    const key = cacheKey('GET', path, '')
    const cached = this.cache.get(key)
    if (cached !== undefined && 'id' in cached) return cached

    const json = await this.fetchJson(`${this.baseUrl}${path}`)
    const parsed = parseOrThrow(bookSchema, json, `GET ${path}`)
    const result = mapBookFromValidated(parsed)
    this.cache.set(key, result)
    return result
  }

  private async fetchJson(url: string): Promise<unknown> {
    let attempt = 0
    let lastError: unknown = null
    while (attempt <= this.maxRetries) {
      const outcome = await this.attemptFetch(url)
      if (outcome.kind === 'ok') return outcome.body
      if (outcome.kind === 'fatal') throw outcome.error
      lastError = outcome.error
      if (attempt >= this.maxRetries) break
      await this.sleep(this.retryBaseDelayMs * 2 ** attempt)
      attempt += 1
    }
    if (lastError instanceof GutendexUpstreamError) throw lastError
    throw new GutendexUpstreamError(
      null,
      `Gutendex request failed for ${url} after ${this.maxRetries + 1} attempt(s)`,
      lastError,
    )
  }

  private async attemptFetch(url: string): Promise<FetchOutcome> {
    let response: Response
    try {
      response = await this.fetchImpl(url)
    } catch (error) {
      return { kind: 'retryable', error }
    }
    if (response.ok) {
      try {
        return { kind: 'ok', body: await response.json() }
      } catch (error) {
        return {
          kind: 'fatal',
          error: new GutendexUpstreamError(
            response.status,
            `Gutendex returned non-JSON body for ${url}`,
            error,
          ),
        }
      }
    }
    const body = await safeReadBody(response)
    const upstreamError = new GutendexUpstreamError(
      response.status,
      `Gutendex responded ${response.status} for ${url}: ${body}`,
    )
    if (response.status >= 400 && response.status < 500) {
      return { kind: 'fatal', error: upstreamError }
    }
    return { kind: 'retryable', error: upstreamError }
  }
}

type FetchOutcome =
  | { kind: 'ok'; body: unknown }
  | { kind: 'fatal'; error: GutendexUpstreamError }
  | { kind: 'retryable'; error: unknown }

function toSearchParams(query: GutendexSearchQuery): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {}
  if (query.q !== undefined) params.search = query.q
  if (query.languages !== undefined && query.languages.length > 0) {
    const sortedLangs = [...query.languages].sort((a, b) => a.localeCompare(b))
    params.languages = sortedLangs.join(',')
  }
  if (query.topic !== undefined) params.topic = query.topic
  if (query.sort !== undefined) params.sort = query.sort
  if (query.page !== undefined) params.page = String(query.page)
  if (query.limit !== undefined) params.limit = String(query.limit)
  return params
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    const text = await response.text()
    return text.length > 500 ? `${text.slice(0, 500)}…` : text
  } catch {
    return '<body unreadable>'
  }
}

function parseOrThrow<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
  context: string,
): z.infer<S> {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  const issues = zodErrorToIssues(result.error)
  throw new GutendexValidationError(
    `Gutendex response validation failed for ${context}`,
    issues,
    result.error,
  )
}
