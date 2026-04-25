import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Database } from '@dialogus/db'
import { createDatabase } from '@dialogus/db'
import { idempotencyKeys } from '@dialogus/db/schema'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { Hono } from 'hono'
import { pino } from 'pino'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { idempotency } from '../../src/infrastructure/http/middleware/idempotency'
import {
  createProblemMiddleware,
  type ProblemVariables,
} from '../../src/infrastructure/http/middleware/problem'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../../../../packages/db/drizzle')

const dockerAvailable = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}']).status === 0

interface TestContext {
  db: Database
  app: Hono<{ Variables: ProblemVariables }>
  handlerInvocations: { count: number }
}

function buildApp(db: Database): TestContext {
  const handlerInvocations = { count: 0 }
  const logger = pino({ level: 'silent' })
  const app = new Hono<{ Variables: ProblemVariables }>()
  app.use('*', createProblemMiddleware({ logger }))
  app.post('/library/books', idempotency({ db, logger }), async (c) => {
    handlerInvocations.count += 1
    const body = (await c.req.json()) as { gutendex_id: number }
    return c.json(
      {
        data: {
          id: `book-${body.gutendex_id}-${handlerInvocations.count}`,
          gutendex_id: body.gutendex_id,
          attempt: handlerInvocations.count,
        },
      },
      201,
    )
  })
  return { db, app, handlerInvocations }
}

describe.skipIf(!dockerAvailable)('idempotency middleware against real Postgres', () => {
  let container: StartedPostgreSqlContainer
  let db: Database
  let ctx: TestContext

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg18')
      .withDatabase('test')
      .withUsername('test')
      .withPassword('test')
      .start()
    db = createDatabase(container.getConnectionUri())
    await migrate(db, { migrationsFolder })
    ctx = buildApp(db)
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
    ctx.handlerInvocations.count = 0
  })

  function postBooks(body: unknown, key?: string): Request {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (key) headers['Idempotency-Key'] = key
    return new Request('http://local/library/books', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  }

  it('replays the same response on a second POST with same key + body', async () => {
    const body = { gutendex_id: 996 }

    const first = await ctx.app.request(postBooks(body, 'key-1'))
    const firstJson = (await first.json()) as Record<string, unknown>
    expect(first.status).toBe(201)
    expect(first.headers.get('X-Idempotency-Replay')).toBeNull()

    const second = await ctx.app.request(postBooks(body, 'key-1'))
    const secondJson = (await second.json()) as Record<string, unknown>

    expect(second.status).toBe(201)
    expect(second.headers.get('X-Idempotency-Replay')).toBe('true')
    expect(secondJson).toEqual(firstJson)
    expect(ctx.handlerInvocations.count).toBe(1)
  })

  it('replays consistently regardless of JSON key order in the body', async () => {
    const first = await ctx.app.request(postBooks({ gutendex_id: 7, lang: 'en' }, 'key-canon'))
    const firstJson = (await first.json()) as Record<string, unknown>
    expect(first.status).toBe(201)

    const second = await ctx.app.request(postBooks({ lang: 'en', gutendex_id: 7 }, 'key-canon'))
    const secondJson = (await second.json()) as Record<string, unknown>

    expect(second.status).toBe(201)
    expect(second.headers.get('X-Idempotency-Replay')).toBe('true')
    expect(secondJson).toEqual(firstJson)
    expect(ctx.handlerInvocations.count).toBe(1)
  })

  it('returns 422 idempotency-key-conflict when the same key carries a different body', async () => {
    const first = await ctx.app.request(postBooks({ gutendex_id: 1 }, 'key-clash'))
    expect(first.status).toBe(201)

    const second = await ctx.app.request(postBooks({ gutendex_id: 2 }, 'key-clash'))
    const body = (await second.json()) as Record<string, unknown>

    expect(second.status).toBe(422)
    expect(second.headers.get('content-type')).toBe('application/problem+json')
    expect(body.type).toBe('urn:dialogus:problems:idempotency-key-conflict')
    expect(body.status).toBe(422)
    expect(ctx.handlerInvocations.count).toBe(1)
  })

  it('does not store the response when the handler returns a non-2xx status', async () => {
    const failingApp = new Hono<{ Variables: ProblemVariables }>()
    const logger = pino({ level: 'silent' })
    failingApp.use('*', createProblemMiddleware({ logger }))
    failingApp.post('/library/books', idempotency({ db, logger }), () => {
      throw new Error('handler failed')
    })

    const failed = await failingApp.request(postBooks({ gutendex_id: 5 }, 'key-fail'))
    expect(failed.status).toBe(500)

    const rows = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, 'key-fail'))
    expect(rows).toHaveLength(0)
  })

  it('runs the handler fresh after the idempotency row is removed (24h cleanup simulation)', async () => {
    const body = { gutendex_id: 42 }
    const first = await ctx.app.request(postBooks(body, 'key-expired'))
    expect(first.status).toBe(201)
    expect(ctx.handlerInvocations.count).toBe(1)

    await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, 'key-expired'))

    const second = await ctx.app.request(postBooks(body, 'key-expired'))
    expect(second.status).toBe(201)
    expect(second.headers.get('X-Idempotency-Replay')).toBeNull()
    expect(ctx.handlerInvocations.count).toBe(2)
  })
})
