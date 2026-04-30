import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { describe, expect, it } from 'vitest'

const ALLOWED_ORIGIN = 'http://localhost:3000'

function buildApp(): Hono {
  const app = new Hono()
  // mirrors start() boot order: cors → requestId → problem → routes
  app.use(
    '*',
    cors({
      origin: ALLOWED_ORIGIN,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Idempotency-Key', 'Authorization'],
      maxAge: 600,
    }),
  )
  app.get('/health', (c) => c.json({ status: 'ok' }))
  app.get('/api/library/books', (c) => c.json({ data: [] }))
  return app
}

describe('CORS middleware — preflight and actual requests', () => {
  it('OPTIONS /api/library/books with allowed origin returns 204 + correct CORS headers', async () => {
    const app = buildApp()
    const res = await app.request('/api/library/books', {
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'content-type',
      },
    })

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN)
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET')
    expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(/content-type/i)
    expect(res.headers.get('Access-Control-Max-Age')).toBe('600')
  })

  it('GET /api/library/books with allowed origin returns 200 + Access-Control-Allow-Origin', async () => {
    const app = buildApp()
    const res = await app.request('/api/library/books', {
      headers: { Origin: ALLOWED_ORIGIN },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN)
  })

  it('GET /api/library/books with disallowed origin does not echo that origin back', async () => {
    const app = buildApp()
    const res = await app.request('/api/library/books', {
      headers: { Origin: 'http://evil.example' },
    })

    const allowOrigin = res.headers.get('Access-Control-Allow-Origin')
    expect(allowOrigin).not.toBe('http://evil.example')
  })

  it('GET /health with allowed origin returns 200 + CORS header (global mount smoke)', async () => {
    const app = buildApp()
    const res = await app.request('/health', {
      headers: { Origin: ALLOWED_ORIGIN },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN)
  })
})
