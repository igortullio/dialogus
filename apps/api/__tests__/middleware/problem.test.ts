import { BookNotFoundError, DuplicateBookError, GutendexUpstreamError } from '@dialogus/catalog'
import {
  ConfigError,
  DialogusError,
  IdempotencyKeyConflictError,
  InvalidCursorError,
  ValidationError,
} from '@dialogus/shared/errors'
import { PROBLEM_TYPE_PREFIX } from '@dialogus/shared/http/problem'
import { Hono } from 'hono'
import { pino, stdSerializers } from 'pino'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createProblemMiddleware,
  INGESTION_PROBLEM_SLUGS,
  type ProblemVariables,
} from '../../src/infrastructure/http/middleware/problem'

interface CapturedLogs {
  lines: Array<Record<string, unknown>>
  logger: ReturnType<typeof pino>
}

function captureLogs(level = 'info'): CapturedLogs {
  const lines: Array<Record<string, unknown>> = []
  const stream = {
    write(chunk: string): void {
      for (const raw of chunk.split('\n')) {
        if (!raw) continue
        try {
          lines.push(JSON.parse(raw) as Record<string, unknown>)
        } catch {
          // ignore non-JSON lines
        }
      }
    },
  }
  const logger = pino(
    { level, serializers: { error: stdSerializers.err } },
    stream as unknown as NodeJS.WritableStream,
  )
  return { lines, logger }
}

function buildApp(
  logger: ReturnType<typeof pino>,
  thrower: () => unknown,
  path = '/test',
): Hono<{ Variables: ProblemVariables }> {
  const app = new Hono<{ Variables: ProblemVariables }>()
  app.use('*', createProblemMiddleware({ logger }))
  app.get(path, () => {
    const value = thrower()
    if (value instanceof Response) return value
    return new Response('ok')
  })
  return app
}

describe('problem middleware', () => {
  it('maps BookNotFoundError to 404 + application/problem+json', async () => {
    const { lines, logger } = captureLogs()
    const app = buildApp(logger, () => {
      throw new BookNotFoundError('Book uuid-123 not found')
    })

    const res = await app.request('/test', { method: 'GET' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}book-not-found`)
    expect(body.title).toBe('Book Not Found')
    expect(body.status).toBe(404)
    expect(body.detail).toBe('Book uuid-123 not found')
    expect(body.instance).toBe('/test')

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      level: 40,
      error_code: 'BOOK_NOT_FOUND',
      error_name: 'BookNotFoundError',
      status: 404,
      path: '/test',
    })
  })

  it('maps DuplicateBookError to 409 with existing_book_id extension', async () => {
    const { logger } = captureLogs()
    const app = buildApp(logger, () => {
      throw new DuplicateBookError('Gutendex 996 already in library as existing-uuid', {
        existingBookId: 'existing-uuid',
      })
    })

    const res = await app.request('/test', { method: 'GET' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(409)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}duplicate-gutendex-id`)
    expect(body.status).toBe(409)
    expect(body.existing_book_id).toBe('existing-uuid')
  })

  it('omits existing_book_id when DuplicateBookError carries no id', async () => {
    const { logger } = captureLogs()
    const app = buildApp(logger, () => {
      throw new DuplicateBookError('Gutendex 996 already in library')
    })

    const res = await app.request('/test', { method: 'GET' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(409)
    expect(body).not.toHaveProperty('existing_book_id')
  })

  it('maps GutendexUpstreamError to 503 with Retry-After: 60', async () => {
    const { logger } = captureLogs()
    const app = buildApp(logger, () => {
      throw new GutendexUpstreamError(503, 'timeout')
    })

    const res = await app.request('/test', { method: 'GET' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(503)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(res.headers.get('retry-after')).toBe('60')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}gutendex-upstream-error`)
    expect(body.detail).toBe('timeout')
  })

  it('maps InvalidCursorError to 400 + invalid-cursor', async () => {
    const { logger } = captureLogs()
    const app = buildApp(logger, () => {
      throw new InvalidCursorError('bad')
    })

    const res = await app.request('/test', { method: 'GET' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(400)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}invalid-cursor`)
    expect(body.status).toBe(400)
    expect(body.detail).toBe('Invalid cursor: bad')
  })

  it('maps IdempotencyKeyConflictError to 422 + idempotency-key-conflict', async () => {
    const { lines, logger } = captureLogs()
    const app = buildApp(logger, () => {
      throw new IdempotencyKeyConflictError('key-99')
    })

    const res = await app.request('/test', { method: 'GET' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(422)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}idempotency-key-conflict`)
    expect(body.status).toBe(422)
    expect(body.detail).toBe('Idempotency-Key key-99 reused with a different request body')

    expect(lines[0]).toMatchObject({
      level: 40,
      error_code: 'IDEMPOTENCY_KEY_CONFLICT',
      error_name: 'IdempotencyKeyConflictError',
      status: 422,
    })
  })

  it('maps ZodError to 400 validation-failed with errors[] field paths', async () => {
    const { logger } = captureLogs()
    const schema = z.object({ name: z.string(), age: z.number() })
    const app = buildApp(logger, () => {
      schema.parse({ name: 42, age: 'oops' })
    })

    const res = await app.request('/test', { method: 'GET' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}validation-failed`)
    const errors = body.errors as Array<{ field: string; message: string }>
    expect(Array.isArray(errors)).toBe(true)
    expect(errors).toHaveLength(2)
    const fields = errors.map((issue) => issue.field).sort()
    expect(fields).toEqual(['age', 'name'])
    for (const issue of errors) {
      expect(typeof issue.message).toBe('string')
      expect(issue.message.length).toBeGreaterThan(0)
    }
  })

  it('maps shared ValidationError to 400 validation-failed (no errors[])', async () => {
    const { logger } = captureLogs()
    const app = buildApp(logger, () => {
      throw new ValidationError('VALIDATION', 'bad input')
    })

    const res = await app.request('/test', { method: 'GET' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(400)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}validation-failed`)
    expect(body.detail).toBe('bad input')
    expect(body).not.toHaveProperty('errors')
  })

  it('maps ConfigError to 500 internal-error with generic detail', async () => {
    const { logger } = captureLogs()
    const app = buildApp(logger, () => {
      throw new ConfigError('INVALID_ENV', 'leaks me')
    })

    const res = await app.request('/test', { method: 'GET' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(500)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}internal-error`)
    expect(body.detail).toBe('unexpected error')
    expect(body).not.toHaveProperty('stack')
  })

  it('maps unknown Error to 500 internal-error and logs stack at ERROR level', async () => {
    const { lines, logger } = captureLogs()
    const boom = new Error('blow up')
    const app = buildApp(logger, () => {
      throw boom
    })

    const res = await app.request('/test', { method: 'GET' })
    const text = await res.text()
    const body = JSON.parse(text) as Record<string, unknown>

    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}internal-error`)
    expect(body.detail).toBe('unexpected error')
    expect(body).not.toHaveProperty('stack')
    expect(text).not.toContain(boom.stack ?? 'never-matches')

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      level: 50,
      error_code: null,
      error_name: 'Error',
      status: 500,
      path: '/test',
    })
    const errorField = lines[0]?.error as { stack?: string } | undefined
    expect(errorField).toBeDefined()
    expect(typeof errorField?.stack).toBe('string')
  })

  it('does not alter the response when handler returns successfully', async () => {
    const { lines, logger } = captureLogs()
    const app = new Hono<{ Variables: ProblemVariables }>()
    app.use('*', createProblemMiddleware({ logger }))
    app.get('/ok', (c) => c.json({ greeting: 'hello' }))

    const res = await app.request('/ok', { method: 'GET' })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect(body).toEqual({ greeting: 'hello' })
    expect(lines).toHaveLength(0)
  })

  it('re-throws non-Error values (e.g. raw strings) so Hono can handle them', async () => {
    const { logger } = captureLogs()
    const app = buildApp(logger, () => {
      throw 'plain string'
    })

    await expect(app.request('/test', { method: 'GET' })).rejects.toBe('plain string')
  })

  it('reads trace_id from x-trace-id header when no context variable is set', async () => {
    const { lines, logger } = captureLogs()
    const app = buildApp(logger, () => {
      throw new BookNotFoundError('uuid-1')
    })

    await app.request('/test', { method: 'GET', headers: { 'x-trace-id': 'header-trace' } })

    expect(lines[0]?.trace_id).toBe('header-trace')
  })

  it('reads trace_id from the context variable when set by an upstream middleware', async () => {
    const { lines, logger } = captureLogs()
    const app = new Hono<{ Variables: ProblemVariables }>()
    app.use('*', async (c, next) => {
      c.set('traceId', 'ctx-trace')
      await next()
    })
    app.use('*', createProblemMiddleware({ logger }))
    app.get('/test', () => {
      throw new BookNotFoundError('uuid-1')
    })

    await app.request('/test', { method: 'GET', headers: { 'x-trace-id': 'header-loses' } })

    expect(lines[0]?.trace_id).toBe('ctx-trace')
  })
})

describe('INGESTION_PROBLEM_SLUGS registry', () => {
  it('maps every feature-002 slug to its default HTTP status code', () => {
    expect(INGESTION_PROBLEM_SLUGS).toEqual({
      'book-not-in-discovered-state': 409,
      'book-not-in-retryable-state': 409,
      'book-already-ready': 409,
      'ingestion-download-failed': 503,
      'ingestion-parse-failed': 422,
      'ingestion-summarize-failed': 503,
      'ingestion-embed-failed': 503,
      'ingestion-concurrency-limit': 429,
      'chunk-not-found': 404,
    })
  })

  it('exposes exactly nine slugs (task_01 inventory + ADR-008 summarize + US2 concurrency cap)', () => {
    expect(Object.keys(INGESTION_PROBLEM_SLUGS)).toHaveLength(9)
  })
})

describe('problem middleware ingestion error dispatch', () => {
  const slugCases: Array<{
    code: string
    slug: keyof typeof INGESTION_PROBLEM_SLUGS
    retryAfter: boolean
  }> = [
    {
      code: 'BOOK_NOT_IN_DISCOVERED_STATE',
      slug: 'book-not-in-discovered-state',
      retryAfter: false,
    },
    { code: 'BOOK_NOT_IN_RETRYABLE_STATE', slug: 'book-not-in-retryable-state', retryAfter: false },
    { code: 'BOOK_ALREADY_READY', slug: 'book-already-ready', retryAfter: false },
    { code: 'INGESTION_DOWNLOAD_FAILED', slug: 'ingestion-download-failed', retryAfter: true },
    { code: 'INGESTION_PARSE_FAILED', slug: 'ingestion-parse-failed', retryAfter: false },
    { code: 'INGESTION_SUMMARIZE_FAILED', slug: 'ingestion-summarize-failed', retryAfter: true },
    { code: 'INGESTION_EMBED_FAILED', slug: 'ingestion-embed-failed', retryAfter: true },
    { code: 'CHUNK_NOT_FOUND', slug: 'chunk-not-found', retryAfter: false },
  ]

  for (const { code, slug, retryAfter } of slugCases) {
    it(`dispatches DialogusError(code=${code}) → ${slug} with status ${INGESTION_PROBLEM_SLUGS[slug]}`, async () => {
      const { logger } = captureLogs()
      const app = buildApp(logger, () => {
        throw new DialogusError(code, `${slug} message`)
      })

      const res = await app.request('/test', { method: 'GET' })
      const body = (await res.json()) as Record<string, unknown>

      expect(res.status).toBe(INGESTION_PROBLEM_SLUGS[slug])
      expect(res.headers.get('content-type')).toBe('application/problem+json')
      expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}${slug}`)
      expect(body.status).toBe(INGESTION_PROBLEM_SLUGS[slug])
      expect(body.detail).toBe(`${slug} message`)

      if (retryAfter) {
        expect(res.headers.get('retry-after')).toBe('60')
      } else {
        expect(res.headers.get('retry-after')).toBeNull()
      }
    })
  }

  it('falls through to internal-error when DialogusError code is not registered', async () => {
    const { logger } = captureLogs()
    const app = buildApp(logger, () => {
      throw new DialogusError('UNREGISTERED_CODE', 'leaks me')
    })

    const res = await app.request('/test', { method: 'GET' })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(500)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}internal-error`)
    expect(body.detail).toBe('unexpected error')
  })
})
