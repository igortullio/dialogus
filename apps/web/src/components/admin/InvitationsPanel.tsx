'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  type AdminInvitation,
  createInvitation,
  fetchInvitations,
  revokeInvitation,
} from '@/lib/api/admin'

const INVITATIONS_KEY = ['admin', 'invitations'] as const

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'default',
  used: 'secondary',
  expired: 'outline',
  revoked: 'destructive',
}

function StatusBadge({ status }: { readonly status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{status}</Badge>
}

/** Owner-facing allowlist management: invite by email, list, and revoke (US3). */
export function InvitationsPanel() {
  const queryClient = useQueryClient()
  const emailId = useId()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const invitationsQuery = useQuery({
    queryKey: INVITATIONS_KEY,
    queryFn: () => fetchInvitations(),
  })

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY })
  }

  const createMutation = useMutation({
    mutationFn: (value: string) => createInvitation({ email: value }),
    onSuccess: async () => {
      setEmail('')
      setError(null)
      await invalidate()
    },
    onError: () =>
      setError('Não foi possível convidar. Já existe um convite ou conta para este e-mail.'),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeInvitation(id),
    onSuccess: () => {
      setError(null)
      return invalidate()
    },
    onError: () => setError('Não foi possível revogar este convite.'),
  })

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = email.trim()
    if (trimmed.length === 0) return
    createMutation.mutate(trimmed)
  }

  const invitations: AdminInvitation[] = invitationsQuery.data?.invitations ?? []

  return (
    <section aria-labelledby="invitations-heading" className="flex flex-col gap-4">
      <h2 id="invitations-heading" className="text-lg font-semibold">
        Convites
      </h2>

      <form onSubmit={handleInvite} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor={emailId} className="text-sm font-medium">
            E-mail
          </label>
          <Input
            id={emailId}
            type="email"
            autoComplete="off"
            placeholder="pessoa@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Convidando…' : 'Convidar'}
        </Button>
      </form>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {invitationsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando convites…</p>
      ) : invitations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum convite ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {invitations.map((invitation) => (
            <li
              key={invitation.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="flex flex-col">
                <span className="font-medium">{invitation.email}</span>
                <span className="text-xs text-muted-foreground">
                  expira em {new Date(invitation.expires_at).toLocaleString('pt-BR')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={invitation.status} />
                {invitation.status === 'pending' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => revokeMutation.mutate(invitation.id)}
                    disabled={revokeMutation.isPending}
                  >
                    Revogar
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
