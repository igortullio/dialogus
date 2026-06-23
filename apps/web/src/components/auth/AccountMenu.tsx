'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

/**
 * Fixed top-right account control: shows the signed-in user's email and a
 * sign-out button (FR-004). Renders nothing when unauthenticated (e.g. on the
 * sign-in page), so it can live in the root layout.
 */
export function AccountMenu() {
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const [pending, setPending] = useState(false)

  if (!session) return null

  async function handleSignOut() {
    setPending(true)
    await authClient.signOut()
    router.replace('/sign-in')
  }

  return (
    <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
      <span className="hidden text-sm text-muted-foreground sm:inline" data-testid="account-email">
        {session.user.email}
      </span>
      <Button variant="outline" size="sm" onClick={handleSignOut} disabled={pending}>
        {pending ? 'Saindo…' : 'Sair'}
      </Button>
    </div>
  )
}
