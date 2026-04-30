import { listLibraryResponseSchema } from '@dialogus/shared/schemas/library'

const DEFAULT_BASE_URL = 'http://localhost:3001'

export interface LibraryCounts {
  readonly total: number
  readonly ready: number
}

const FALLBACK: LibraryCounts = { total: 0, ready: 0 }

function isCountEnvelope(value: unknown): value is { meta: { count: number } } {
  if (typeof value !== 'object' || value === null) return false
  const meta = (value as { meta?: unknown }).meta
  if (typeof meta !== 'object' || meta === null) return false
  const count = (meta as { count?: unknown }).count
  return typeof count === 'number' && Number.isInteger(count) && count >= 0
}

async function fetchCount(url: string): Promise<number> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const json: unknown = await response.json()
  if (!isCountEnvelope(json)) throw new Error('invalid response shape')
  return json.meta.count
}

export async function fetchLibraryCount(): Promise<number> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_BASE_URL
  try {
    const response = await fetch(`${base}/api/library/books?limit=1`, { cache: 'no-store' })
    if (!response.ok) return 0
    const json: unknown = await response.json()
    const parsed = listLibraryResponseSchema.safeParse(json)
    return parsed.success ? parsed.data.meta.count : 0
  } catch {
    return 0
  }
}

export async function fetchLibraryCountByStatus(): Promise<LibraryCounts> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_BASE_URL
  try {
    const [total, ready] = await Promise.all([
      fetchCount(`${base}/api/library/books?limit=1`),
      fetchCount(`${base}/api/library/books?status=ready&limit=1`),
    ])
    return { total, ready }
  } catch {
    return FALLBACK
  }
}
