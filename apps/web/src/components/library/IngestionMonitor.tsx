'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { type FetchLibraryResult, fetchLibrary } from '@/lib/api/library'
import { LIBRARY_QUERY_KEY } from '@/lib/query-keys'
import { isInProgress } from './StatusBadge'

const POLL_INTERVAL_MS = 4000

/**
 * Background polling component mounted in the root layout. Watches the
 * library for ingestion-status transitions and surfaces them as toasts so
 * the user notices when a book reaches "ready" or "failed" even when not
 * looking at /library.
 */
export function IngestionMonitor() {
  const previousByIdRef = useRef<Map<string, string>>(new Map())
  const initializedRef = useRef(false)

  const query = useQuery<FetchLibraryResult>({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: () => fetchLibrary(),
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
      // Seed the snapshot on first render so we don't toast for the
      // pre-existing state of the library.
      for (const book of books) previous.set(book.id, book.ingestion_status)
      initializedRef.current = true
      return
    }

    for (const book of books) {
      const prev = previous.get(book.id)
      const curr = book.ingestion_status
      previous.set(book.id, curr)
      if (prev === undefined || prev === curr) continue
      // Toast only on terminal transitions out of an active stage.
      const wasActive = prev === 'discovered' || isInProgress(prev as never)
      if (!wasActive) continue
      if (curr === 'ready') {
        toast.success(`"${book.title}" está pronto para conversa.`)
      } else if (curr === 'failed') {
        toast.error(
          `Falhou ao ingerir "${book.title}". ${book.ingestion_error ?? 'Veja a biblioteca.'}`,
          { duration: 8000 },
        )
      }
    }
  }, [query.data])

  return null
}
