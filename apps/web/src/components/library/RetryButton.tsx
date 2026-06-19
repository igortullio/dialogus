'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
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
import { retryIngestion } from '@/lib/api/library'
import { cn } from '@/lib/utils'

const RETRY_LABEL = 'Tentar novamente'
const TITLE = 'Tentar a ingestão novamente?'
const DESCRIPTION_PREFIX =
  'Repetir a ingestão pode levar alguns minutos e consumir recursos do Gutendex.'
const NO_ERROR_FALLBACK = 'Nenhuma mensagem de erro disponível.'
const CONFIRM_LABEL = 'Tentar novamente'
const CONFIRM_PENDING_LABEL = 'Reiniciando…'
const CANCEL_LABEL = 'Cancelar'
const ERROR_TOAST = 'Não foi possível reiniciar a ingestão.'
const SUCCESS_TOAST_PREFIX = 'Reingestão iniciada'
const STAGE_LABEL: Record<string, string> = {
  download: 'baixar',
  clean: 'limpar',
  parse: 'parsear',
  chunk: 'chunking',
  summarize: 'sumarizar',
  embed: 'embeddings',
  index: 'indexar',
}
const LIBRARY_QUERY_KEY = ['library'] as const
const INGESTION_QUERY_KEY = (id: string) => ['ingestion', id] as const

function makeIdempotencyKey(bookId: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `retry-${bookId}-${crypto.randomUUID()}`
  }
  return `retry-${bookId}-${Date.now()}`
}

export interface RetryButtonProps {
  readonly bookId: string
  readonly lastError?: string | null
  readonly className?: string
  readonly triggerLabel?: string
}

export function RetryButton({
  bookId,
  lastError,
  className,
  triggerLabel = RETRY_LABEL,
}: RetryButtonProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: () => retryIngestion(bookId, makeIdempotencyKey(bookId)),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: INGESTION_QUERY_KEY(bookId) })
      setOpen(false)
      const stage = STAGE_LABEL[result.resumingStage] ?? result.resumingStage
      toast.success(`${SUCCESS_TOAST_PREFIX} — retomando do estágio "${stage}".`)
    },
    onError: () => {
      toast.error(ERROR_TOAST)
    },
  })

  const errorText = lastError && lastError.length > 0 ? lastError : NO_ERROR_FALLBACK

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-slot="book-card-action-retry"
        onClick={() => setOpen(true)}
        className={cn('min-h-10', className)}
      >
        {triggerLabel}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent data-slot="retry-button-dialog" data-book-id={bookId} size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{TITLE}</AlertDialogTitle>
            <AlertDialogDescription data-slot="retry-button-dialog-description">
              {DESCRIPTION_PREFIX}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p
            data-slot="retry-button-last-error"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive text-xs"
          >
            {errorText}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel data-slot="retry-button-dialog-cancel" disabled={mutation.isPending}>
              {CANCEL_LABEL}
            </AlertDialogCancel>
            <AlertDialogAction
              data-slot="retry-button-dialog-confirm"
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                mutation.mutate()
              }}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                  {CONFIRM_PENDING_LABEL}
                </>
              ) : (
                CONFIRM_LABEL
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export const _internals = {
  RETRY_LABEL,
  TITLE,
  DESCRIPTION_PREFIX,
  NO_ERROR_FALLBACK,
  CONFIRM_LABEL,
  CONFIRM_PENDING_LABEL,
  CANCEL_LABEL,
  ERROR_TOAST,
  SUCCESS_TOAST_PREFIX,
  STAGE_LABEL,
  makeIdempotencyKey,
}
