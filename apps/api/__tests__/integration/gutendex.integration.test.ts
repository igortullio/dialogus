import { PROBLEM_TYPE_PREFIX } from '@dialogus/shared/http/problem'
import { Hono } from 'hono'
import { setupServer } from 'msw/node'
import { pino } from 'pino'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  FIXTURE_BASE_URL,
  fiveHundredHandler,
  happyPathHandlers,
  validationFailureHandler,
} from '../../../../packages/catalog/__fixtures__/gutendex/handlers'
import { GutendexHttpClient } from '../../../../packages/catalog/src/infrastructure/external/GutendexHttpClient'
import {
  createProblemMiddleware,
  type ProblemVariables,
} from '../../src/infrastructure/http/middleware/problem'
import { createCatalogRoute } from '../../src/infrastructure/http/routes/catalog'

const server = setupServer(...happyPathHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function buildApp(): Hono<{ Variables: ProblemVariables }> {
  const gutendexClient = new GutendexHttpClient({
    baseUrl: FIXTURE_BASE_URL,
    retryBaseDelayMs: 1,
    sleep: async () => {},
  })
  const app = new Hono<{ Variables: ProblemVariables }>()
  app.use('*', createProblemMiddleware({ logger: pino({ level: 'silent' }) }))
  app.route('/api/catalog', createCatalogRoute({ gutendexClient }))
  return app
}

describe('GET /api/catalog/search (integration — MSW + real GutendexHttpClient)', () => {
  it('returns 200 envelope with ≥1 result for Don Quixote search', async () => {
    const app = buildApp()

    const res = await app.request('/api/catalog/search?q=Don+Quixote&language=en')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    const data = body.data as unknown[]
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThanOrEqual(1)
    const meta = body.meta as Record<string, unknown>
    expect(typeof meta?.count).toBe('number')
    expect(meta.count as number).toBeGreaterThanOrEqual(1)
    const links = body.links as Record<string, unknown>
    expect(typeof links?.self).toBe('string')
  })

  it('returns 503 Problem Details gutendex-upstream-error when MSW simulates 5xx', async () => {
    server.use(fiveHundredHandler())
    const app = buildApp()

    const res = await app.request('/api/catalog/search?q=test')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(503)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}gutendex-upstream-error`)
    expect(body.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('60')
  })

  it('returns 503 Problem Details gutendex-validation-failed when MSW returns malformed data', async () => {
    server.use(validationFailureHandler())
    const app = buildApp()

    const res = await app.request('/api/catalog/search?q=test')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(503)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}gutendex-validation-failed`)
    expect(body.status).toBe(503)
  })
})
