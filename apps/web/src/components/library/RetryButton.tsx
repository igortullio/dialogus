'use client'

import type { IngestionStage } from '@dialogus/shared/schemas/ingestion'
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
import { stageDisplayName } from '@/lib/ingestion/messages'
import { cn } from '@/lib/utils'

const RETRY_LABEL = 'Tentar novamente'
const TITLE = 'Retomar a ingestão?'
const DESCRIPTION_GENERIC =
  'A ingestão será retomada do ponto em que parou. Pode levar alguns minutos.'
const NO_ERROR_FALLBACK = 'Nenhuma mensagem de erro disponível.'
const CONFIRM_LABEL = 'Retomar'
const CONFIRM_PENDING_LABEL = 'Retomando…'
const CANCEL_LABEL = 'Cancelar'
const ERROR_TOAST = 'Não foi possível retomar a ingestão.'
const SUCCESS_TOAST_PREFIX = 'Ingestão retomada'

/** Resume wording (feature 002): name the stage + state that completed work is kept. */
function resumeDescription(resumeStage: IngestionStage | null | undefined): string {
  if (!resumeStage) return DESCRIPTION_GENERIC
  return `Continua da etapa "${stageDisplayName(resumeStage)}" — as etapas já concluídas não serão refeitas. Pode levar alguns minutos.`
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
  readonly resumeStage?: IngestionStage | null
  readonly className?: string
  readonly triggerLabel?: string
}

export function RetryButton({
  bookId,
  lastError,
  resumeStage,
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
      const stage = stageDisplayName((result.resumingStage as IngestionStage) ?? 'download')
      toast.success(`${SUCCESS_TOAST_PREFIX} — retomando da etapa "${stage}".`)
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
              {resumeDescription(resumeStage)}
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
  DESCRIPTION_GENERIC,
  resumeDescription,
  NO_ERROR_FALLBACK,
  CONFIRM_LABEL,
  CONFIRM_PENDING_LABEL,
  CANCEL_LABEL,
  ERROR_TOAST,
  SUCCESS_TOAST_PREFIX,
  makeIdempotencyKey,
}
