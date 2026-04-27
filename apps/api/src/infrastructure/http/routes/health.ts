import type { Database } from '@dialogus/db'
import { probeDb, probePgBoss } from '@dialogus/db'
import { healthResponseSchema } from '@dialogus/shared/schemas/health'
import { Hono } from 'hono'

const DEFAULT_MASTRA_PROBE_TIMEOUT_MS = 1000
const MASTRA_HEALTH_PATH = '/api/health'

export type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean }>

export interface HealthRouteDeps {
  db: Database
  mastraUrl: string
  fetchImpl?: FetchLike
  probeTimeoutMs?: number
}

export async function probeMastra(
  baseUrl: string,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const timeoutMs = options.timeoutMs ?? DEFAULT_MASTRA_PROBE_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const url = new URL(MASTRA_HEALTH_PATH, baseUrl).toString()
    const response = await fetchImpl(url, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export function createHealthRoute(deps: HealthRouteDeps): Hono {
  const app = new Hono()

  app.get('/', async (c) => {
    const [dbUp, pgbossUp, mastraUp] = await Promise.all([
      probeDb(deps.db),
      probePgBoss(deps.db),
      probeMastra(deps.mastraUrl, {
        fetchImpl: deps.fetchImpl,
        timeoutMs: deps.probeTimeoutMs,
      }),
    ])
    const body = healthResponseSchema.parse({
      api: 'up',
      db: dbUp ? 'up' : 'down',
      pgboss: pgbossUp ? 'up' : 'down',
      mastra: mastraUp ? 'up' : 'down',
    })
    return c.json(body, 200)
  })

  return app
}
