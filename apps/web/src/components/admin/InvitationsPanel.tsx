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
  type InvitationStatus,
  revokeInvitation,
} from '@/lib/api/admin'

const INVITATIONS_KEY = ['admin', 'invitations'] as const

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'default',
  used: 'secondary',
  expired: 'outline',
  revoked: 'destructive',
}

const STATUS_FILTERS: ReadonlyArray<{ value: InvitationStatus; label: string }> = [
  { value: 'pending', label: 'Pendentes' },
  { value: 'used', label: 'Usados' },
  { value: 'expired', label: 'Expirados' },
  { value: 'revoked', label: 'Revogados' },
]

function StatusBadge({ status }: { readonly status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{status}</Badge>
}

/** Owner-facing allowlist management: invite by email, filter, and revoke (US3). */
export function InvitationsPanel() {
  const queryClient = useQueryClient()
  const emailId = useId()
  const filterId = useId()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Default to pending so a used/revoked invite doesn't clutter the live list;
  // the filter exposes the other states for auditing.
  const [statusFilter, setStatusFilter] = useState<InvitationStatus>('pending')

  const invitationsQuery = useQuery({
    queryKey: [...INVITATIONS_KEY, statusFilter],
    queryFn: () => fetchInvitations({ status: statusFilter }),
  })

  function invalidate() {
    // Prefix match invalidates every status filter's cached page.
    return queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY })
  }

  const createMutation = useMutation({
    mutationFn: (value: string) => createInvitation({ email: value }),
    onSuccess: async () => {
      setEmail('')
      setError(null)
      // A new invite is always pending — switch the view so it's visible.
      setStatusFilter('pending')
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

      <div className="flex items-center gap-2">
        <label htmlFor={filterId} className="text-sm text-muted-foreground">
          Mostrar
        </label>
        <select
          id={filterId}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InvitationStatus)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {invitationsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando convites…</p>
      ) : invitations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum convite neste filtro.</p>
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
