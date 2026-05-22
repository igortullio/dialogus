'use client'

import type { IngestionStatus, IngestionStatusDto } from '@dialogus/shared/schemas/ingestion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Book } from '@/lib/api/_schemas'
import { fetchIngestionStatus, startIngestion } from '@/lib/api/library'
import { cn } from '@/lib/utils'
import { BookDetailsDialog } from './BookDetailsDialog'
import { CoverFallback } from './CoverFallback'
import { RemoveBookDialog } from './RemoveBookDialog'
import { RetryButton } from './RetryButton'
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

interface CoverProps {
  readonly book: Book
}

function Cover({ book }: CoverProps) {
  const [failed, setFailed] = useState(false)
  if (book.cover_url && !failed) {
    return (
      <img
        src={book.cover_url}
        alt={`Capa de '${book.title}'`}
        data-slot="book-card-cover"
        loading="lazy"
        onError={() => setFailed(true)}
        className="aspect-[2/3] w-full rounded-md border bg-muted object-cover"
      />
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
}

export function BookCard({ book, className }: BookCardProps) {
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

  const liveStatus: IngestionStatus = liveStatusQuery.data?.status ?? book.ingestion_status
  const liveProgress = liveStatusQuery.data?.progress ?? 0
  const inProgress = isInProgress(liveStatus)
  const lastError = liveStatusQuery.data?.error?.message ?? book.ingestion_error ?? null

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
        `Falhou ao ingerir "${book.title}". ${lastError ?? 'Veja a biblioteca para tentar novamente.'}`,
        { duration: 8000 },
      )
    }
  }, [liveStatus, book.title, lastError])

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
        <Cover book={book} />
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
          {inProgress && <ProgressBar value={liveProgress} />}
        </div>

        <div data-slot="book-card-actions" className="mt-auto flex flex-col gap-2">
          {liveStatus === 'discovered' && (
            <Button
              type="button"
              size="sm"
              data-slot="book-card-action-ingest"
              onClick={() => ingestMutation.mutate()}
              disabled={ingestMutation.isPending}
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
                className="flex-1"
              >
                {DETAILS_LABEL}
              </Button>
              <RemoveBookDialog book={book} className="flex-1" />
            </div>
          )}
          {liveStatus === 'failed' && (
            <div className="flex flex-col gap-1">
              {lastError && (
                <p
                  role="alert"
                  data-slot="book-card-error"
                  className="text-destructive text-xs leading-snug"
                >
                  {lastError}
                </p>
              )}
              <RetryButton bookId={book.id} lastError={lastError} />
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
