'use client'

import type { IngestionStatusDto } from '@dialogus/shared/schemas/ingestion'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CoverFallback } from '@/components/library/CoverFallback'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Book } from '@/lib/api/_schemas'
import {
  addBook,
  type FetchLibraryResult,
  fetchIngestionStatus,
  fetchLibrary,
  startIngestion,
} from '@/lib/api/library'
import { ONBOARDING_TITLES, type OnboardingTitle } from '@/lib/onboarding-titles'
import { LIBRARY_QUERY_KEY } from '@/lib/query-keys'
import { cn } from '@/lib/utils'

const POLL_INTERVAL_MS = 2000

const HEADING_COPY = 'Primeiros passos'
const SUBHEADING_COPY = 'comece com:'
const ALL_READY_HEADING_COPY = 'Pronto!'
const ALL_READY_BODY_COPY =
  'Os três livros estão prontos. Abra a composição para fazer sua primeira pergunta.'
const ALL_READY_LINK_COPY = 'Abrir composição'

export type CardPhase = 'idle' | 'adding' | 'ingesting' | 'ready' | 'error'

interface CardRuntimeState {
  readonly phase: CardPhase
  readonly bookId: string | null
  readonly error: string | null
}

const INITIAL_STATE: CardRuntimeState = { phase: 'idle', bookId: null, error: null }

function languageFlag(language: 'en' | 'pt'): string {
  if (language === 'pt') return '🇧🇷'
  return '🇬🇧'
}

interface OnboardingBookCardProps {
  readonly title: OnboardingTitle
  readonly existingBook: Book | null
  onReady(gutendexId: number): void
}

function deriveStateFromBook(book: Book): CardRuntimeState {
  if (book.ingestion_status === 'ready') {
    return { phase: 'ready', bookId: book.id, error: null }
  }
  if (book.ingestion_status === 'failed') {
    return {
      phase: 'error',
      bookId: book.id,
      error: book.ingestion_error ?? 'Falha na ingestão.',
    }
  }
  return { phase: 'ingesting', bookId: book.id, error: null }
}

function OnboardingBookCard({ title, existingBook, onReady }: OnboardingBookCardProps) {
  const [state, setState] = useState<CardRuntimeState>(() =>
    existingBook ? deriveStateFromBook(existingBook) : INITIAL_STATE,
  )
  const [coverFailed, setCoverFailed] = useState(false)

  // Seed from library data when it arrives after first render.
  useEffect(() => {
    if (!existingBook || state.phase !== 'idle') return
    setState(deriveStateFromBook(existingBook))
  }, [existingBook, state.phase])

  const onClick = useCallback(async () => {
    setState({ phase: 'adding', bookId: null, error: null })
    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `add-${title.gutendexId}-${Date.now()}`
      const book = await addBook(title.gutendexId, idempotencyKey)
      setState({ phase: 'ingesting', bookId: book.id, error: null })
      await startIngestion(book.id, idempotencyKey)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro inesperado'
      setState({ phase: 'error', bookId: null, error: message })
    }
  }, [title.gutendexId])

  const status = useQuery<IngestionStatusDto>({
    queryKey: ['onboarding-ingestion', state.bookId ?? ''],
    queryFn: () => fetchIngestionStatus(state.bookId as string),
    enabled: state.phase === 'ingesting' && state.bookId !== null,
    refetchInterval: (query) => {
      const data = query.state.data as IngestionStatusDto | undefined
      if (!data) return POLL_INTERVAL_MS
      if (data.status === 'ready' || data.status === 'failed') return false
      return POLL_INTERVAL_MS
    },
  })

  const ingestionStatus = status.data?.status
  const ingestionErrorMessage = status.data?.error?.message ?? null

  useEffect(() => {
    if (state.phase !== 'ingesting' || ingestionStatus === undefined) return
    if (ingestionStatus === 'ready') {
      setState({ phase: 'ready', bookId: state.bookId, error: null })
      onReady(title.gutendexId)
      return
    }
    if (ingestionStatus === 'failed') {
      setState({
        phase: 'error',
        bookId: null,
        error: ingestionErrorMessage ?? 'Falha na ingestão.',
      })
    }
  }, [state.phase, state.bookId, ingestionStatus, ingestionErrorMessage, onReady, title.gutendexId])

  // Notify parent when card boots already in 'ready' (book already in library).
  useEffect(() => {
    if (state.phase === 'ready') onReady(title.gutendexId)
  }, [state.phase, onReady, title.gutendexId])

  return (
    <Card
      data-slot="onboarding-book-card"
      data-gutendex-id={title.gutendexId}
      data-phase={state.phase}
      className="flex h-full flex-col"
    >
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        {coverFailed ? (
          <CoverFallback title={title.title} author={title.author} />
        ) : (
          <img
            src={title.coverUrl}
            alt={`Capa de '${title.title}'`}
            data-slot="onboarding-book-cover"
            loading="lazy"
            onError={() => setCoverFailed(true)}
            className="aspect-[3/4] w-full rounded-md border bg-muted object-cover"
          />
        )}
        <div className="flex flex-col gap-1">
          <span className="font-medium leading-tight">{title.title}</span>
          <span className="text-muted-foreground text-xs leading-tight">{title.author}</span>
          <span className="text-muted-foreground text-xs leading-tight">
            <span aria-hidden className="mr-1">
              {languageFlag(title.language)}
            </span>
            <span className="uppercase">{title.language}</span>
          </span>
        </div>
        <CardActions
          phase={state.phase}
          error={state.error}
          stage={status.data?.stage ?? null}
          progress={status.data?.progress ?? 0}
          onClick={onClick}
        />
      </CardContent>
    </Card>
  )
}

interface CardActionsProps {
  readonly phase: CardPhase
  readonly error: string | null
  readonly stage: string | null
  readonly progress: number
  onClick(): void
}

function CardActions({ phase, error, stage, progress, onClick }: CardActionsProps) {
  if (phase === 'idle') {
    return (
      <Button
        type="button"
        size="sm"
        onClick={onClick}
        data-slot="onboarding-add-button"
        className="mt-auto"
      >
        Adicionar e ingerir
      </Button>
    )
  }
  if (phase === 'adding') {
    return (
      <p className="mt-auto text-muted-foreground text-xs" data-slot="onboarding-status">
        Adicionando ao acervo…
      </p>
    )
  }
  if (phase === 'ingesting') {
    return (
      <div className="mt-auto flex flex-col gap-1" data-slot="onboarding-progress">
        <span className="text-muted-foreground text-xs">
          {stage ? `Ingerindo: ${stage}` : 'Ingerindo…'}
        </span>
        <div
          aria-hidden
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="presentation"
        >
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      </div>
    )
  }
  if (phase === 'ready') {
    return (
      <p className="mt-auto text-status-ready text-xs" data-slot="onboarding-ready">
        Pronto!
      </p>
    )
  }
  return (
    <div className="mt-auto flex flex-col gap-2" data-slot="onboarding-error">
      <span role="alert" className="text-destructive text-xs">
        {error ?? 'Erro inesperado.'}
      </span>
      <Button type="button" size="sm" variant="outline" onClick={onClick}>
        Tentar novamente
      </Button>
    </div>
  )
}

export interface EmptyStateCardProps {
  readonly className?: string
}

export function EmptyStateCard({ className }: EmptyStateCardProps) {
  const [readyIds, setReadyIds] = useState<ReadonlySet<number>>(new Set())

  const library = useQuery<FetchLibraryResult>({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: () => fetchLibrary({ limit: 32 }),
  })

  const booksByGutendexId = useMemo(() => {
    const map = new Map<number, Book>()
    for (const book of library.data?.books ?? []) {
      map.set(book.gutendex_id, book)
    }
    return map
  }, [library.data])

  const onReady = useCallback((gutendexId: number) => {
    setReadyIds((previous) => {
      if (previous.has(gutendexId)) return previous
      const next = new Set(previous)
      next.add(gutendexId)
      return next
    })
  }, [])

  const allReady = readyIds.size === ONBOARDING_TITLES.length

  if (allReady) {
    return (
      <section
        data-slot="empty-state-card"
        data-state="all-ready"
        className={cn('rounded-lg border bg-card p-4', className)}
      >
        <h2 className="font-medium text-base">{ALL_READY_HEADING_COPY}</h2>
        <p className="mt-1 text-muted-foreground text-sm">{ALL_READY_BODY_COPY}</p>
        <Link
          href="/"
          data-slot="empty-state-compose-link"
          className="mt-3 inline-flex text-primary text-sm underline-offset-2 hover:underline"
        >
          {ALL_READY_LINK_COPY}
        </Link>
      </section>
    )
  }

  return (
    <section
      data-slot="empty-state-card"
      data-state="onboarding"
      className={cn('rounded-lg border bg-card p-4', className)}
    >
      <h2 className="font-medium text-base">{HEADING_COPY}</h2>
      <p className="mt-1 text-muted-foreground text-sm">{SUBHEADING_COPY}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {ONBOARDING_TITLES.map((title) => (
          <li key={`onboarding-${title.gutendexId}`} className="contents">
            <OnboardingBookCard
              title={title}
              existingBook={booksByGutendexId.get(title.gutendexId) ?? null}
              onReady={onReady}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

export const _internals = {
  HEADING_COPY,
  SUBHEADING_COPY,
  ALL_READY_HEADING_COPY,
  ALL_READY_BODY_COPY,
  ALL_READY_LINK_COPY,
}
