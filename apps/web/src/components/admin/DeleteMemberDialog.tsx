'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { deleteMember } from '@/lib/api/admin'

const MEMBERS_KEY = ['admin', 'members'] as const

export interface DeleteMemberDialogProps {
  readonly memberId: string
  readonly email: string
  readonly disabled?: boolean
  readonly onError?: (error: unknown) => void
}

/**
 * Confirmation dialog for permanently deleting a member account (FR-023). The
 * action is irreversible — it removes the user's conversations, library
 * membership and preferences — so it is gated behind an explicit confirm.
 */
export function DeleteMemberDialog({
  memberId,
  email,
  disabled,
  onError,
}: DeleteMemberDialogProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: () => deleteMember(memberId),
    onSuccess: async () => {
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: MEMBERS_KEY })
    },
    onError: (error) => {
      setOpen(false)
      onError?.(error)
    },
  })

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Excluir
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir permanentemente a conta de <strong>{email}</strong>? Isso remove as conversas,
              a biblioteca e as preferências desta pessoa. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                mutation.mutate()
              }}
            >
              Excluir conta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
