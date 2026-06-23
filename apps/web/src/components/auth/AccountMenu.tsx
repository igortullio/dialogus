'use client'

import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

/**
 * Fixed top-right account control: shows the signed-in user's email, an Admin
 * link (admins only), and a sign-out button (FR-004). Renders nothing when
 * unauthenticated (e.g. on the sign-in page), so it can live in the root layout.
 */
export function AccountMenu() {
  const queryClient = useQueryClient()
  const { data: session } = authClient.useSession()
  const [pending, setPending] = useState(false)
  // The session is only known on the client (better-auth caches it client-side),
  // so SSR renders nothing while the first client render already has a session.
  // Render nothing until mounted so the server and first client render agree —
  // otherwise React fails hydration and regenerates the whole tree (which also
  // briefly makes the header buttons unclickable).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted || !session) return null

  const isAdmin = (session.user as { role?: string }).role === 'admin'

  async function handleSignOut() {
    setPending(true)
    try {
      await authClient.signOut()
    } finally {
      // Drop cached per-user data (threads, metadata) so the next user on this
      // browser never sees the previous user's conversations (FR-006), then do a
      // hard navigation: it guarantees the client session cache is cleared and
      // the UI lands in a clean signed-out state (fixes the stuck "Saindo…").
      queryClient.clear()
      window.location.assign('/sign-in')
    }
  }

  return (
    <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
      <span className="hidden text-sm text-muted-foreground sm:inline" data-testid="account-email">
        {session.user.email}
      </span>
      {isAdmin ? (
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">Admin</Link>
        </Button>
      ) : null}
      <Button variant="outline" size="sm" onClick={handleSignOut} disabled={pending}>
        {pending ? 'Saindo…' : 'Sair'}
      </Button>
    </div>
  )
}
