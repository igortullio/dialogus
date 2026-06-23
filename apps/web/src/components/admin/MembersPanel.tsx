'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api/_error'
import {
  fetchMembers,
  type Member,
  restoreMember,
  revokeMember,
  setMemberRole,
} from '@/lib/api/admin'
import { DeleteMemberDialog } from './DeleteMemberDialog'

function errorMessageFor(error: unknown): string {
  if (error instanceof ApiError && error.slug === 'last-admin') {
    return 'Ação não permitida: o sistema precisa manter ao menos um administrador.'
  }
  return 'Não foi possível concluir a ação. Tente novamente.'
}

const MEMBERS_KEY = ['admin', 'members'] as const

/** Owner-facing access control: list members, revoke/restore, change role (US3). */
export function MembersPanel() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const membersQuery = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => fetchMembers() })

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: MEMBERS_KEY })
  }

  function onSuccess() {
    setError(null)
    return invalidate()
  }

  function onMutationError(error: unknown) {
    setError(errorMessageFor(error))
  }

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeMember(id),
    onSuccess,
    onError: onMutationError,
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreMember(id),
    onSuccess,
    onError: onMutationError,
  })

  const roleMutation = useMutation({
    mutationFn: (input: { id: string; role: 'admin' | 'member' }) =>
      setMemberRole(input.id, input.role),
    onSuccess,
    onError: onMutationError,
  })

  const members: Member[] = membersQuery.data?.members ?? []
  const busy = revokeMutation.isPending || restoreMutation.isPending || roleMutation.isPending

  return (
    <section aria-labelledby="members-heading" className="flex flex-col gap-4">
      <h2 id="members-heading" className="text-lg font-semibold">
        Membros
      </h2>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {membersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando membros…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="flex flex-col">
                <span className="font-medium">{member.email}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                    {member.role}
                  </Badge>
                  {member.banned ? <Badge variant="destructive">revogado</Badge> : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {member.role === 'admin' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => roleMutation.mutate({ id: member.id, role: 'member' })}
                    disabled={busy}
                  >
                    Tornar membro
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => roleMutation.mutate({ id: member.id, role: 'admin' })}
                    disabled={busy}
                  >
                    Tornar admin
                  </Button>
                )}
                {member.banned ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => restoreMutation.mutate(member.id)}
                    disabled={busy}
                  >
                    Restaurar
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => revokeMutation.mutate(member.id)}
                    disabled={busy}
                  >
                    Revogar
                  </Button>
                )}
                <DeleteMemberDialog
                  memberId={member.id}
                  email={member.email}
                  disabled={busy}
                  onError={onMutationError}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
