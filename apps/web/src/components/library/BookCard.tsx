'use client'

import type {
  IngestionStage,
  IngestionStatus,
  IngestionStatusDto,
} from '@dialogus/shared/schemas/ingestion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Book } from '@/lib/api/_schemas'
import { fetchIngestionStatus, startIngestion } from '@/lib/api/library'
import {
  friendlyErrorMessage,
  isRetryableSlug,
  parseErrorSlug,
  slugToStage,
} from '@/lib/ingestion/messages'
import { cn } from '@/lib/utils'
import { BookDetailsDialog } from './BookDetailsDialog'
import { CoverFallback } from './CoverFallback'
import { RemoveBookDialog } from './RemoveBookDialog'
import { RetryButton } from './RetryButton'
import { StageStepper } from './StageStepper'
import { isInProgress, StatusBadge } from './StatusBadge'

const POLL_INTERVAL_MS = 2000
const LIBRARY_QUERY_KEY = ['library'] as const
const INGESTION_QUERY_KEY = (id: string) => ['ingestion', id] as const

const INGEST_LABEL = 'Ingerir'
const DETAILS_LABEL = 'Detalhes'
const COVER_FALLBACK_HINT = 'Sem capa'

function languageFlag(code: string | undefined): string {
  if (!code) return '📘'
  if (code === 'pt') return '🇧🇷'
  if (code === 'en') return '🇬🇧'
  return '📘'
}

function authorList(book: Book): string {
  if (book.authors.length === 0) return 'Autor desconhecido'
  return book.authors.map((a) => a.name).join(', ')
}

function makeIdempotencyKey(prefix: string, id: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${id}-${crypto.randomUUID()}`
  }
  return `${prefix}-${id}-${Date.now()}`
}

interface DisplayError {
  readonly message: string | null
  readonly stage: IngestionStage | null
  readonly retryable: boolean
}

/**
 * Resolve a failed book's display error. Prefers the live poll's typed error,
 * falling back to parsing the raw `ingestion_error` field — the raw
 * `<slug>: <message>` is never surfaced, only the localized friendly message.
 */
function deriveDisplayError(
  rawError: string | null,
  data: IngestionStatusDto | undefined,
): DisplayError {
  const errorData = data?.error ?? null
  const slug = errorData?.slug ?? parseErrorSlug(rawError)
  const stage = errorData?.stage ?? slugToStage(slug)
  const retryable = errorData?.retryable ?? isRetryableSlug(slug)
  const message = slug
    ? friendlyErrorMessage(slug, { stage, stageIndex: data?.stage_index ?? null, retryable })
    : null
  return { message, stage, retryable }
}

interface CoverProps {
  readonly book: Book
  readonly priority?: boolean
}

function Cover({ book, priority }: CoverProps) {
  const [failed, setFailed] = useState(false)
  if (book.cover_url && !failed) {
    return (
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md border bg-muted">
        <Image
          src={book.cover_url}
          alt={`Capa de '${book.title}'`}
          data-slot="book-card-cover"
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 200px"
          onError={() => setFailed(true)}
          className="object-cover"
          // Above-the-fold covers load eagerly so they don't trip Next's LCP
          // "image should be eager" warning; the rest stay lazy.
          priority={priority}
          unoptimized
        />
      </div>
    )
  }
  return (
    <div data-slot="book-card-cover-fallback" className="w-full">
      <span className="sr-only">{COVER_FALLBACK_HINT}</span>
      <CoverFallback title={book.title} author={book.authors[0]?.name} />
    </div>
  )
}

interface ProgressBarProps {
  readonly value: number
}

function ProgressBar({ value }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      data-slot="book-card-progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        data-slot="book-card-progress-fill"
        className="h-full bg-status-progress transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export interface BookCardProps {
  readonly book: Book
  readonly className?: string
  readonly priority?: boolean
}

export function BookCard({ book, className, priority }: BookCardProps) {
  const queryClient = useQueryClient()
  const [detailsOpen, setDetailsOpen] = useState(false)

  const liveStatusQuery = useQuery<IngestionStatusDto>({
    queryKey: INGESTION_QUERY_KEY(book.id),
    queryFn: () => fetchIngestionStatus(book.id),
    enabled: isInProgress(book.ingestion_status),
    refetchInterval: (query) => {
      const data = query.state.data as IngestionStatusDto | undefined
      if (!data) return POLL_INTERVAL_MS
      if (data.status === 'ready' || data.status === 'failed') return false
      return POLL_INTERVAL_MS
    },
  })

  // Once the library list reports a terminal status, trust it over the live
  // poll: when the prop flips to ready/failed the poll query is disabled and
  // its cache freezes on the last in-progress stage (e.g. "Embeddings 100%").
  // The fresh terminal prop must win so the card settles on Pronto/Falhou.
  const propIsTerminal = book.ingestion_status === 'ready' || book.ingestion_status === 'failed'
  const liveStatus: IngestionStatus = propIsTerminal
    ? book.ingestion_status
    : (liveStatusQuery.data?.status ?? book.ingestion_status)
  const liveProgress = liveStatusQuery.data?.progress ?? 0
  const inProgress = isInProgress(liveStatus)

  const displayError = deriveDisplayError(book.ingestion_error, liveStatusQuery.data)
  const friendlyError = displayError.message

  // Surface terminal transitions (in-progress → ready/failed) as toasts so
  // the user notices even when not staring at this card.
  const previousStatusRef = useRef<IngestionStatus>(book.ingestion_status)
  useEffect(() => {
    const previous = previousStatusRef.current
    previousStatusRef.current = liveStatus
    if (previous === liveStatus) return
    if (!isInProgress(previous) && previous !== 'discovered') return
    if (liveStatus === 'ready') {
      toast.success(`"${book.title}" está pronto para conversa.`)
    } else if (liveStatus === 'failed') {
      toast.error(
        `Falhou ao ingerir "${book.title}". ${friendlyError ?? 'Veja a biblioteca para tentar novamente.'}`,
        { duration: 8000 },
      )
    }
  }, [liveStatus, book.title, friendlyError])

  const invalidateLibrary = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY })
  }, [queryClient])

  const ingestMutation = useMutation({
    mutationFn: () => startIngestion(book.id, makeIdempotencyKey('ingest', book.id)),
    onSuccess: invalidateLibrary,
  })

  return (
    <Card
      data-slot="book-card"
      data-book-id={book.id}
      data-status={liveStatus}
      className={cn('flex h-full flex-col', className)}
    >
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <Cover book={book} priority={priority} />
        <div className="flex flex-col gap-1">
          <h3
            data-slot="book-card-title"
            className="line-clamp-2 font-serif text-base leading-tight"
            title={book.title}
          >
            {book.title}
          </h3>
          <p data-slot="book-card-authors" className="text-muted-foreground text-sm leading-tight">
            {authorList(book)}
          </p>
          <p data-slot="book-card-language" className="text-muted-foreground text-xs leading-tight">
            <span aria-hidden className="mr-1">
              {languageFlag(book.languages[0])}
            </span>
            <span className="uppercase">{book.languages[0] ?? '—'}</span>
          </p>
        </div>

        <div data-slot="book-card-status-row" className="flex flex-col gap-2">
          <StatusBadge status={liveStatus} progress={inProgress ? liveProgress : undefined} />
          {inProgress &&
            (liveStatusQuery.data ? (
              <StageStepper status={liveStatusQuery.data} />
            ) : (
              <ProgressBar value={liveProgress} />
            ))}
        </div>

        <div data-slot="book-card-actions" className="mt-auto flex flex-col gap-2">
          {liveStatus === 'discovered' && (
            <Button
              type="button"
              size="sm"
              data-slot="book-card-action-ingest"
              onClick={() => ingestMutation.mutate()}
              disabled={ingestMutation.isPending}
              className="min-h-10"
            >
              {INGEST_LABEL}
            </Button>
          )}
          {liveStatus === 'ready' && (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-slot="book-card-action-details"
                onClick={() => setDetailsOpen(true)}
                className="min-h-10 flex-1"
              >
                {DETAILS_LABEL}
              </Button>
              <RemoveBookDialog book={book} className="flex-1" />
            </div>
          )}
          {liveStatus === 'failed' && (
            <div className="flex flex-col gap-1">
              {friendlyError && (
                <p
                  role="alert"
                  data-slot="book-card-error"
                  className="text-destructive text-xs leading-snug"
                >
                  {friendlyError}
                </p>
              )}
              {/* FR-009: retry is offered ONLY for recoverable failures. */}
              {displayError.retryable ? (
                <RetryButton
                  bookId={book.id}
                  lastError={friendlyError}
                  resumeStage={displayError.stage}
                />
              ) : (
                <p
                  data-slot="book-card-error-nonretryable"
                  className="text-muted-foreground text-xs"
                >
                  Esta falha não é recuperável automaticamente.
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>

      {liveStatus === 'ready' && (
        <BookDetailsDialog book={book} open={detailsOpen} onOpenChange={setDetailsOpen} />
      )}
    </Card>
  )
}

export const _internals = {
  POLL_INTERVAL_MS,
  LIBRARY_QUERY_KEY,
  INGESTION_QUERY_KEY,
  INGEST_LABEL,
  DETAILS_LABEL,
  COVER_FALLBACK_HINT,
  languageFlag,
  authorList,
  makeIdempotencyKey,
}
