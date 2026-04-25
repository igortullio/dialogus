import { createHash } from 'node:crypto'
import type { Database } from '@dialogus/db'
import { IdempotencyKeyConflictError } from '@dialogus/shared/errors'
import { Hono } from 'hono'
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { canonicalizeBody, idempotency } from '../../src/infrastructure/http/middleware/idempotency'

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

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
  const logger = pino({ level }, stream as unknown as NodeJS.WritableStream)
  return { lines, logger }
}

interface FakeDbOptions {
  selectResult?: Array<{
    key: string
    requestHash: string
    responseStatus: number
    responseBody: unknown
    createdAt: Date
  }>
  insert?: ReturnType<typeof vi.fn>
}

interface FakeDb {
  db: Database
  selectSpy: ReturnType<typeof vi.fn>
  insertSpy: ReturnType<typeof vi.fn>
  valuesSpy: ReturnType<typeof vi.fn>
}

function buildFakeDb(options: FakeDbOptions = {}): FakeDb {
  const selectResult = options.selectResult ?? []
  const valuesSpy = options.insert ?? vi.fn().mockResolvedValue(undefined)
  const limit = vi.fn().mockResolvedValue(selectResult)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const selectSpy = vi.fn().mockReturnValue({ from })
  const insertSpy = vi.fn().mockReturnValue({ values: valuesSpy })
  const db = { select: selectSpy, insert: insertSpy } as unknown as Database
  return { db, selectSpy, insertSpy, valuesSpy }
}

interface BuildAppOptions {
  handler: (body: unknown) => Response | Promise<Response>
  fake: FakeDb
  logger?: ReturnType<typeof pino>
}

function buildApp({ handler, fake, logger }: BuildAppOptions): {
  app: Hono
  handlerSpy: ReturnType<typeof vi.fn>
  capturedError: { value: unknown }
} {
  const app = new Hono()
  const capturedError: { value: unknown } = { value: undefined }
  const handlerSpy = vi.fn(async (c: Parameters<Parameters<typeof app.post>[1]>[0]) => {
    let body: unknown = null
    try {
      body = await c.req.json()
    } catch {
      body = null
    }
    return handler(body)
  })
  app.use('/books', idempotency({ db: fake.db, logger }))
  app.post('/books', handlerSpy)
  app.onError((err, c) => {
    capturedError.value = err
    return c.json({ error: 'caught' }, 500)
  })
  return { app, handlerSpy, capturedError }
}

function postRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://local/books', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('canonicalizeBody', () => {
  it('produces the same string regardless of object key order', () => {
    expect(canonicalizeBody({ b: 2, a: 1 })).toBe(canonicalizeBody({ a: 1, b: 2 }))
  })

  it('sorts nested object keys recursively', () => {
    const a = canonicalizeBody({ outer: { z: 1, a: 2 } })
    const b = canonicalizeBody({ outer: { a: 2, z: 1 } })
    expect(a).toBe(b)
    expect(a).toBe('{"outer":{"a":2,"z":1}}')
  })

  it('preserves array order', () => {
    expect(canonicalizeBody([3, 1, 2])).toBe('[3,1,2]')
  })

  it('handles primitives, null, and arrays of objects', () => {
    expect(canonicalizeBody(null)).toBe('null')
    expect(canonicalizeBody('hi')).toBe('"hi"')
    expect(canonicalizeBody(7)).toBe('7')
    expect(canonicalizeBody(true)).toBe('true')
    expect(canonicalizeBody([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]')
  })
})

describe('idempotency middleware', () => {
  it('is a no-op when Idempotency-Key header is absent', async () => {
    const fake = buildFakeDb()
    const { app, handlerSpy } = buildApp({
      fake,
      handler: () => new Response(JSON.stringify({ ok: true }), { status: 201 }),
    })

    const res = await app.request(postRequest({ gutendex_id: 1 }))

    expect(res.status).toBe(201)
    expect(res.headers.get('X-Idempotency-Replay')).toBeNull()
    expect(handlerSpy).toHaveBeenCalledTimes(1)
    expect(fake.selectSpy).not.toHaveBeenCalled()
    expect(fake.insertSpy).not.toHaveBeenCalled()
  })

  it('runs handler and inserts row on first request with key', async () => {
    const fake = buildFakeDb({ selectResult: [] })
    const { lines, logger } = captureLogs()
    const { app, handlerSpy } = buildApp({
      fake,
      logger,
      handler: () =>
        new Response(JSON.stringify({ data: { id: 'book-1' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    })

    const res = await app.request(postRequest({ gutendex_id: 1 }, { 'Idempotency-Key': 'key-abc' }))
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(201)
    expect(handlerSpy).toHaveBeenCalledTimes(1)
    expect(body).toEqual({ data: { id: 'book-1' } })

    expect(fake.selectSpy).toHaveBeenCalledTimes(1)
    expect(fake.insertSpy).toHaveBeenCalledTimes(1)
    const inserted = fake.valuesSpy.mock.calls[0]?.[0] as Record<string, unknown>
    expect(inserted.key).toBe('key-abc')
    expect(typeof inserted.requestHash).toBe('string')
    expect(inserted.responseStatus).toBe(201)
    expect(inserted.responseBody).toEqual({ data: { id: 'book-1' } })

    const insertLog = lines.find((line) => line.action === 'insert')
    expect(insertLog).toMatchObject({ idempotency_key: 'key-abc', status: 201 })
  })

  it('replays cached response when stored hash matches', async () => {
    const requestBody = { gutendex_id: 42 }
    const cached = {
      key: 'key-xyz',
      requestHash: sha256Hex(canonicalizeBody(requestBody)),
      responseStatus: 201,
      responseBody: { data: { id: 'book-cached' } },
      createdAt: new Date(),
    }
    const fake = buildFakeDb({ selectResult: [cached] })
    const { lines, logger } = captureLogs()
    const handler = vi.fn(
      () => new Response(JSON.stringify({ data: { id: 'fresh' } }), { status: 201 }),
    )
    const { app, handlerSpy } = buildApp({ fake, logger, handler })

    const res = await app.request(postRequest(requestBody, { 'Idempotency-Key': 'key-xyz' }))
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(201)
    expect(res.headers.get('X-Idempotency-Replay')).toBe('true')
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(body).toEqual({ data: { id: 'book-cached' } })
    expect(handlerSpy).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
    expect(fake.insertSpy).not.toHaveBeenCalled()

    const replayLog = lines.find((line) => line.action === 'replay')
    expect(replayLog).toMatchObject({ idempotency_key: 'key-xyz', status: 201 })
  })

  it('throws IdempotencyKeyConflictError when stored hash differs', async () => {
    const fake = buildFakeDb({
      selectResult: [
        {
          key: 'key-clash',
          requestHash: 'completely-different-hash',
          responseStatus: 201,
          responseBody: { data: { id: 'old' } },
          createdAt: new Date(),
        },
      ],
    })
    const { lines, logger } = captureLogs()
    const { app, handlerSpy, capturedError } = buildApp({
      fake,
      logger,
      handler: () => new Response('never', { status: 201 }),
    })

    await app.request(postRequest({ gutendex_id: 7 }, { 'Idempotency-Key': 'key-clash' }))

    expect(capturedError.value).toBeInstanceOf(IdempotencyKeyConflictError)
    expect((capturedError.value as IdempotencyKeyConflictError).key).toBe('key-clash')
    expect(handlerSpy).not.toHaveBeenCalled()
    expect(fake.insertSpy).not.toHaveBeenCalled()

    const conflictLog = lines.find((line) => line.action === 'conflict')
    expect(conflictLog).toMatchObject({ idempotency_key: 'key-clash' })
  })

  it('does not store the response when the handler returns a non-2xx status', async () => {
    const fake = buildFakeDb({ selectResult: [] })
    const { app } = buildApp({
      fake,
      handler: () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
    })

    const res = await app.request(
      postRequest({ gutendex_id: 9 }, { 'Idempotency-Key': 'key-fail' }),
    )

    expect(res.status).toBe(500)
    expect(fake.selectSpy).toHaveBeenCalledTimes(1)
    expect(fake.insertSpy).not.toHaveBeenCalled()
  })

  it('hashes the canonical body so reordered keys hit the same cached row', async () => {
    const fake = buildFakeDb({ selectResult: [] })
    const { app } = buildApp({
      fake,
      handler: () => new Response(JSON.stringify({ ok: true }), { status: 201 }),
    })

    await app.request(postRequest({ a: 1, b: 2 }, { 'Idempotency-Key': 'key-canon-1' }))
    await app.request(postRequest({ b: 2, a: 1 }, { 'Idempotency-Key': 'key-canon-2' }))

    const firstHash = (fake.valuesSpy.mock.calls[0]?.[0] as Record<string, unknown>).requestHash
    const secondHash = (fake.valuesSpy.mock.calls[1]?.[0] as Record<string, unknown>).requestHash
    expect(firstHash).toBe(secondHash)
  })
})
