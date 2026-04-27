import type { Database } from '@dialogus/db'
import { healthResponseSchema } from '@dialogus/shared/schemas/health'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHealthRoute, type FetchLike } from '../src/infrastructure/http/routes/health'

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
const MASTRA_URL = 'http://localhost:3002'

afterEach(() => {
  probeDbMock.mockReset()
  probePgBossMock.mockReset()
})

function fetchOk(): FetchLike {
  return async () => ({ ok: true })
}

function fetchReject(): FetchLike {
  return async () => {
    throw new Error('mastra unreachable')
  }
}

async function callHealth(fetchImpl: FetchLike = fetchOk()): Promise<Response> {
  const app = createHealthRoute({ db: fakeDb, mastraUrl: MASTRA_URL, fetchImpl })
  return await app.request('/', { method: 'GET' })
}

describe('createHealthRoute', () => {
  it('returns api/db/pgboss/mastra all up when probes resolve true', async () => {
    probeDbMock.mockResolvedValue(true)
    probePgBossMock.mockResolvedValue(true)

    const res = await callHealth()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ api: 'up', db: 'up', pgboss: 'up', mastra: 'up' })
    expect(healthResponseSchema.safeParse(body).success).toBe(true)
  })

  it('returns db:down when probeDb resolves false', async () => {
    probeDbMock.mockResolvedValue(false)
    probePgBossMock.mockResolvedValue(true)

    const res = await callHealth()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ api: 'up', db: 'down', pgboss: 'up', mastra: 'up' })
    expect(healthResponseSchema.safeParse(body).success).toBe(true)
  })

  it('returns pgboss:down when probePgBoss resolves false', async () => {
    probeDbMock.mockResolvedValue(true)
    probePgBossMock.mockResolvedValue(false)

    const res = await callHealth()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ api: 'up', db: 'up', pgboss: 'down', mastra: 'up' })
    expect(healthResponseSchema.safeParse(body).success).toBe(true)
  })

  it('returns mastra:down when fetch rejects but does not fail other probes', async () => {
    probeDbMock.mockResolvedValue(true)
    probePgBossMock.mockResolvedValue(true)

    const res = await callHealth(fetchReject())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ api: 'up', db: 'up', pgboss: 'up', mastra: 'down' })
    expect(healthResponseSchema.safeParse(body).success).toBe(true)
  })

  it('returns mastra:down when mastra responds non-ok', async () => {
    probeDbMock.mockResolvedValue(true)
    probePgBossMock.mockResolvedValue(true)
    const fetchImpl: FetchLike = async () => ({ ok: false })

    const res = await callHealth(fetchImpl)
    const body = await res.json()

    expect(body).toEqual({ api: 'up', db: 'up', pgboss: 'up', mastra: 'down' })
  })

  it('returns 200 with all probes down when every probe fails', async () => {
    probeDbMock.mockResolvedValue(false)
    probePgBossMock.mockResolvedValue(false)

    const res = await callHealth(fetchReject())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ api: 'up', db: 'down', pgboss: 'down', mastra: 'down' })
    expect(healthResponseSchema.safeParse(body).success).toBe(true)
  })

  it('responds with Content-Type application/json', async () => {
    probeDbMock.mockResolvedValue(true)
    probePgBossMock.mockResolvedValue(true)

    const res = await callHealth()

    expect(res.headers.get('content-type')).toMatch(/application\/json/)
  })

  it('runs all probes in parallel via Promise.all', async () => {
    const callOrder: string[] = []
    let resolveDb: (value: boolean) => void = () => {}
    let resolvePgBoss: (value: boolean) => void = () => {}
    let resolveMastra: (value: { ok: boolean }) => void = () => {}

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
    const fetchImpl: FetchLike = () => {
      callOrder.push('mastra:start')
      return new Promise<{ ok: boolean }>((resolve) => {
        resolveMastra = resolve
      })
    }

    const pending = callHealth(fetchImpl)
    await new Promise((r) => setImmediate(r))

    expect(callOrder).toEqual(['db:start', 'pgboss:start', 'mastra:start'])

    resolveMastra({ ok: true })
    resolvePgBoss(true)
    resolveDb(true)

    const res = await pending
    expect(res.status).toBe(200)
  })
})
