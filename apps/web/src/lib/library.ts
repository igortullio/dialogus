import { listLibraryResponseSchema } from '@dialogus/shared/schemas/library'
import { headers } from 'next/headers'

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

/**
 * These counts run server-side (the landing page is a Server Component), so the
 * inbound session Cookie must be forwarded to the now-auth-gated `/api/library`
 * endpoint — otherwise the API replies 401 and the count silently reads 0.
 */
async function inboundCookieHeader(): Promise<{ cookie: string } | undefined> {
  try {
    const cookie = (await headers()).get('cookie')
    return cookie ? { cookie } : undefined
  } catch {
    // Not in a request scope (e.g. unit test without the next/headers mock).
    return undefined
  }
}

function countRequestInit(cookieHeader: { cookie: string } | undefined): RequestInit {
  const init: RequestInit = { cache: 'no-store' }
  if (cookieHeader) init.headers = cookieHeader
  return init
}

async function fetchCount(
  url: string,
  cookieHeader: { cookie: string } | undefined,
): Promise<number> {
  const response = await fetch(url, countRequestInit(cookieHeader))
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const json: unknown = await response.json()
  if (!isCountEnvelope(json)) throw new Error('invalid response shape')
  return json.meta.count
}

export async function fetchLibraryCount(): Promise<number> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_BASE_URL
  const cookieHeader = await inboundCookieHeader()
  try {
    const response = await fetch(
      `${base}/api/library/books?limit=1`,
      countRequestInit(cookieHeader),
    )
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
  const cookieHeader = await inboundCookieHeader()
  try {
    const [total, ready] = await Promise.all([
      fetchCount(`${base}/api/library/books?limit=1`, cookieHeader),
      fetchCount(`${base}/api/library/books?status=ready&limit=1`, cookieHeader),
    ])
    return { total, ready }
  } catch {
    return FALLBACK
  }
}
