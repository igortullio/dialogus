import { type NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/**
 * Gate every app route behind an authenticated session (FR-001). Excludes
 * Next internals, static files, the web's own `/api/*` route handlers, and the
 * `/sign-in` page itself (to avoid a redirect loop). Session validity is
 * checked against the Hono API (the session authority) by forwarding cookies.
 *
 * Next 16 renamed the `middleware` convention to `proxy`.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sign-in|api|.*\\.).*)'],
}

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const cookie = req.headers.get('cookie')
  if (!cookie) return false
  try {
    const res = await fetch(`${API_BASE}/api/auth/get-session`, {
      headers: { cookie },
      cache: 'no-store',
    })
    if (!res.ok) return false
    const data = (await res.json()) as { user?: unknown } | null
    return Boolean(data?.user)
  } catch {
    return false
  }
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  if (await isAuthenticated(req)) return NextResponse.next()
  const url = req.nextUrl.clone()
  url.pathname = '/sign-in'
  url.search = `?redirect=${encodeURIComponent(req.nextUrl.pathname)}`
  return NextResponse.redirect(url)
}
