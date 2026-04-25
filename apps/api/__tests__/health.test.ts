import type { Database } from '@dialogus/db'
import { healthResponseSchema } from '@dialogus/shared/schemas/health'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHealthRoute } from '../src/infrastructure/http/routes/health'

const probeDbMock = vi.hoisted(() => vi.fn())
const probePgBossMock = vi.hoisted(() => vi.fn())

vi.mock('@dialogus/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dialogus/db')>()
  return {
    ...actual,
    probeDb: probeDbMock,
    probePgBoss: probePgBossMock,
  }
})

const fakeDb = {} as Database

afterEach(() => {
  probeDbMock.mockReset()
  probePgBossMock.mockReset()
})

async function callHealth(): Promise<Response> {
  const app = createHealthRoute({ db: fakeDb })
  return await app.request('/', { method: 'GET' })
}

describe('createHealthRoute', () => {
  it('returns api:up / db:up / pgboss:up when both probes resolve true', async () => {
    probeDbMock.mockResolvedValue(true)
    probePgBossMock.mockResolvedValue(true)

    const res = await callHealth()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ api: 'up', db: 'up', pgboss: 'up' })
    expect(healthResponseSchema.safeParse(body).success).toBe(true)
  })

  it('returns db:down when probeDb resolves false', async () => {
    probeDbMock.mockResolvedValue(false)
    probePgBossMock.mockResolvedValue(true)

    const res = await callHealth()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ api: 'up', db: 'down', pgboss: 'up' })
    expect(healthResponseSchema.safeParse(body).success).toBe(true)
  })

  it('returns pgboss:down when probePgBoss resolves false', async () => {
    probeDbMock.mockResolvedValue(true)
    probePgBossMock.mockResolvedValue(false)

    const res = await callHealth()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ api: 'up', db: 'up', pgboss: 'down' })
    expect(healthResponseSchema.safeParse(body).success).toBe(true)
  })

  it('returns 200 with both down when both probes resolve false', async () => {
    probeDbMock.mockResolvedValue(false)
    probePgBossMock.mockResolvedValue(false)

    const res = await callHealth()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ api: 'up', db: 'down', pgboss: 'down' })
    expect(healthResponseSchema.safeParse(body).success).toBe(true)
  })

  it('responds with Content-Type application/json', async () => {
    probeDbMock.mockResolvedValue(true)
    probePgBossMock.mockResolvedValue(true)

    const res = await callHealth()

    expect(res.headers.get('content-type')).toMatch(/application\/json/)
  })

  it('runs probeDb and probePgBoss in parallel via Promise.all', async () => {
    const callOrder: string[] = []
    let resolveDb: (value: boolean) => void = () => {}
    let resolvePgBoss: (value: boolean) => void = () => {}

    probeDbMock.mockImplementation(() => {
      callOrder.push('db:start')
      return new Promise<boolean>((resolve) => {
        resolveDb = resolve
      })
    })
    probePgBossMock.mockImplementation(() => {
      callOrder.push('pgboss:start')
      return new Promise<boolean>((resolve) => {
        resolvePgBoss = resolve
      })
    })

    const pending = callHealth()
    await new Promise((r) => setImmediate(r))

    expect(callOrder).toEqual(['db:start', 'pgboss:start'])

    resolvePgBoss(true)
    resolveDb(true)

    const res = await pending
    expect(res.status).toBe(200)
  })
})
