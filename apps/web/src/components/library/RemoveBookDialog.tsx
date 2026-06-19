'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
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
import type { Book } from '@/lib/api/_schemas'
import { removeBook } from '@/lib/api/library'
import { cn } from '@/lib/utils'

const REMOVE_LABEL = 'Remover'
const TITLE = 'Remover livro?'
const CONFIRM_LABEL = 'Remover'
const CANCEL_LABEL = 'Cancelar'
const ERROR_TOAST = 'Não foi possível remover o livro.'
const LIBRARY_QUERY_KEY = ['library'] as const

function describe(title: string): string {
  return `Remover '${title}' da biblioteca? Os arquivos baixados continuarão em cache; você pode restaurar mais tarde via API.`
}

export interface RemoveBookDialogProps {
  readonly book: Book
  readonly className?: string
  readonly triggerLabel?: string
}

export function RemoveBookDialog({
  book,
  className,
  triggerLabel = REMOVE_LABEL,
}: RemoveBookDialogProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: () => removeBook(book.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY })
      setOpen(false)
    },
    onError: () => {
      toast.error(ERROR_TOAST)
    },
  })

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        data-slot="book-card-action-remove"
        onClick={() => setOpen(true)}
        className={cn('min-h-10', className)}
      >
        {triggerLabel}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent data-slot="remove-book-dialog" data-book-id={book.id} size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{TITLE}</AlertDialogTitle>
            <AlertDialogDescription data-slot="remove-book-dialog-description">
              {describe(book.title)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-slot="remove-book-dialog-cancel">
              {CANCEL_LABEL}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              data-slot="remove-book-dialog-confirm"
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                mutation.mutate()
              }}
            >
              {CONFIRM_LABEL}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export const _internals = {
  TITLE,
  REMOVE_LABEL,
  CONFIRM_LABEL,
  CANCEL_LABEL,
  ERROR_TOAST,
  describe,
}
