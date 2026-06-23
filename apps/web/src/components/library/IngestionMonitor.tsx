'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { Book } from '@/lib/api/_schemas'
import { type FetchLibraryResult, fetchLibrary } from '@/lib/api/library'
import { authClient } from '@/lib/auth-client'
import { LIBRARY_QUERY_KEY } from '@/lib/query-keys'
import { isInProgress } from './StatusBadge'

const POLL_INTERVAL_MS = 4000

function seedSnapshot(books: readonly Book[], previous: Map<string, string>): void {
  // First render: capture the current state without toasting, so we only
  // notify on transitions that happen *after* the user opens the app.
  for (const book of books) previous.set(book.id, book.ingestion_status)
}

function notifyTerminalTransition(book: Book, prev: string | undefined): void {
  if (prev === undefined) return
  const curr = book.ingestion_status
  if (prev === curr) return
  const wasActive = prev === 'discovered' || isInProgress(prev as never)
  if (!wasActive) return
  if (curr === 'ready') {
    toast.success(`"${book.title}" está pronto para conversa.`)
    return
  }
  if (curr === 'failed') {
    toast.error(
      `Falhou ao ingerir "${book.title}". ${book.ingestion_error ?? 'Veja a biblioteca.'}`,
      { duration: 8000 },
    )
  }
}

/**
 * Background polling component mounted in the root layout. Watches the
 * library for ingestion-status transitions and surfaces them as toasts so
 * the user notices when a book reaches "ready" or "failed" even when not
 * looking at /library.
 */
export function IngestionMonitor() {
  const previousByIdRef = useRef<Map<string, string>>(new Map())
  const initializedRef = useRef(false)
  // Mounted globally in the root layout, so it renders on every page — including
  // `/sign-in`. The library endpoint is session-gated (requireAuth), so polling
  // it while signed out is a 401 loop. Only poll once authenticated.
  const { data: session } = authClient.useSession()

  const query = useQuery<FetchLibraryResult>({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: () => fetchLibrary(),
    enabled: Boolean(session),
    refetchInterval: (q) => {
      const data = q.state.data as FetchLibraryResult | undefined
      if (!data) return POLL_INTERVAL_MS
      const anyInProgress = data.books.some((book) => isInProgress(book.ingestion_status))
      // Slow the poll cadence when nothing is in flight: reuse the same key
      // as the rest of the app, so the cache stays warm and other components
      // (LibraryGrid, EmptyStateCard, BookPicker) read the freshest data.
      return anyInProgress ? POLL_INTERVAL_MS : 30_000
    },
  })

  useEffect(() => {
    const books = query.data?.books
    if (!books) return
    const previous = previousByIdRef.current

    if (!initializedRef.current) {
      seedSnapshot(books, previous)
      initializedRef.current = true
      return
    }

    for (const book of books) {
      const prev = previous.get(book.id)
      previous.set(book.id, book.ingestion_status)
      notifyTerminalTransition(book, prev)
    }
  }, [query.data])

  return null
}
