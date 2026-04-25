import { type HealthResponse, healthResponseSchema } from '@dialogus/shared/schemas/health'

const DEFAULT_BASE_URL = 'http://localhost:3001'
const FALLBACK: HealthResponse = { api: 'up', db: 'down', pgboss: 'down' }

export async function fetchHealth(): Promise<HealthResponse> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_BASE_URL
  try {
    const response = await fetch(`${base}/health`, { cache: 'no-store' })
    if (!response.ok) return FALLBACK
    const json = await response.json()
    const parsed = healthResponseSchema.safeParse(json)
    return parsed.success ? parsed.data : FALLBACK
  } catch {
    return FALLBACK
  }
}
