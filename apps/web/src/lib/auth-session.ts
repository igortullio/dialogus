import { headers } from 'next/headers'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export interface SessionUser {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly role: string
}

/**
 * Reads the authenticated session server-side (Server Components, route
 * handlers) by forwarding the inbound Cookie header to the Hono API's
 * `/api/auth/get-session`. Returns null when unauthenticated. The API is the
 * single session authority, so the web tier only forwards cookies.
 */
export async function getServerSession(): Promise<{ user: SessionUser } | null> {
  const cookie = (await headers()).get('cookie')
  if (!cookie) return null
  try {
    const res = await fetch(`${API_BASE}/api/auth/get-session`, {
      headers: { cookie },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { user?: SessionUser } | null
    return data?.user ? { user: data.user } : null
  } catch {
    return null
  }
}
