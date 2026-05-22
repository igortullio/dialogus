'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  closeAddBookDrawer,
  setAddBookDrawerOpen,
  useAddBookDrawerOpen,
} from '@/components/chat/add-book-drawer-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ApiError } from '@/lib/api/_error'
import type { Book, GutendexBook } from '@/lib/api/_schemas'
import {
  type GutendexLanguage,
  type SearchGutendexParams,
  type SearchGutendexResult,
  searchGutendex,
} from '@/lib/api/catalog'
import { addBook, restoreBook } from '@/lib/api/library'
import { cn } from '@/lib/utils'
import { CoverFallback } from './CoverFallback'

const LIBRARY_QUERY_KEY = ['library'] as const
const SEARCH_DEBOUNCE_MS = 300
const SEARCH_STALE_MS = 60_000
const RESULT_LIMIT = 20

const SHEET_TITLE = 'Adicionar do Gutendex'
const SHEET_DESCRIPTION =
  'Busque títulos no Gutendex e adicione ao seu acervo. A ingestão começa em segundo plano.'
const SEARCH_PLACEHOLDER = 'Buscar por título ou autor…'
const SEARCH_LABEL = 'Buscar no Gutendex'
const FILTER_GROUP_LABEL = 'Filtrar por idioma'
const FILTER_LABELS: Record<LanguageFilter, string> = {
  both: 'Ambos',
  en: 'EN',
  pt: 'PT',
}
const ADD_LABEL = 'Adicionar'
const ADDED_LABEL = 'Adicionado — ingestindo…'
const ADD_ERROR_LABEL = 'Tentar novamente'
const LOAD_MORE_LABEL = 'Carregar mais'
const NO_RESULTS = 'Nenhum livro encontrado para esta busca.'
const TYPE_TO_SEARCH = 'Digite ao menos 2 caracteres para buscar.'
const LOAD_ERROR = 'Não foi possível buscar no Gutendex.'
const ADD_ERROR_TOAST = 'Não foi possível adicionar este livro.'

type LanguageFilter = 'both' | 'en' | 'pt'

interface AddRowState {
  readonly status: 'idle' | 'pending' | 'added' | 'error'
}

const FILTER_VALUES: readonly LanguageFilter[] = ['both', 'en', 'pt']

function makeIdempotencyKey(gutendexId: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `add-${gutendexId}-${crypto.randomUUID()}`
  }
  return `add-${gutendexId}-${Date.now()}`
}

function authorList(book: GutendexBook): string {
  if (book.authors.length === 0) return 'Autor desconhecido'
  return book.authors.map((a) => a.name).join(', ')
}

function searchParamsFor(query: string, filter: LanguageFilter): SearchGutendexParams {
  const trimmed = query.trim()
  return {
    limit: RESULT_LIMIT,
    ...(trimmed.length > 0 ? { q: trimmed } : {}),
    ...(filter !== 'both' ? { language: filter as GutendexLanguage } : {}),
  }
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(handle)
  }, [value, delayMs])
  return debounced
}

interface ResultRowProps {
  readonly book: GutendexBook
  readonly state: AddRowState
  onAdd(): void
}

interface ResultCoverProps {
  readonly book: GutendexBook
}

function ResultCover({ book }: ResultCoverProps) {
  const [failed, setFailed] = useState(false)
  // Reset on cover_url change so a different row reusing this slot retries.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dep is the reset trigger
  useEffect(() => {
    setFailed(false)
  }, [book.cover_url])
  if (!book.cover_url || failed) {
    return <CoverFallback title={book.title} author={book.authors[0]?.name} />
  }
  return (
    // biome-ignore lint/performance/noImgElement: third-party covers may be unsupported by next/image
    <img
      src={book.cover_url}
      alt={`Capa de '${book.title}'`}
      data-slot="add-gutendex-row-cover"
      loading="lazy"
      onError={() => setFailed(true)}
      className="aspect-[2/3] w-full rounded-md border bg-muted object-cover"
    />
  )
}

function ResultRow({ book, state, onAdd }: ResultRowProps) {
  const isPending = state.status === 'pending'
  const isAdded = state.status === 'added'
  const isError = state.status === 'error'
  const buttonLabel = isError ? ADD_ERROR_LABEL : ADD_LABEL

  return (
    <li
      data-slot="add-gutendex-row"
      data-gutendex-id={book.id}
      data-state={state.status}
      className="flex gap-3 rounded-md border bg-card p-3"
    >
      <div className="w-16 shrink-0">
        <ResultCover book={book} />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <h3
          data-slot="add-gutendex-row-title"
          className="line-clamp-2 font-serif text-sm leading-tight"
          title={book.title}
        >
          {book.title}
        </h3>
        <p
          data-slot="add-gutendex-row-authors"
          className="text-muted-foreground text-xs leading-tight"
        >
          {authorList(book)}
        </p>
        <p
          data-slot="add-gutendex-row-language"
          className="text-muted-foreground text-xs uppercase"
        >
          {book.languages.join(' · ') || '—'}
        </p>
        <div className="mt-auto pt-1">
          {isAdded ? (
            <span
              data-slot="add-gutendex-row-status"
              className="inline-flex items-center gap-1 text-status-progress text-xs"
            >
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              {ADDED_LABEL}
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant={isError ? 'destructive' : 'default'}
              data-slot="add-gutendex-row-add"
              onClick={onAdd}
              disabled={isPending}
            >
              {isPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
              {buttonLabel}
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

interface ResultsListProps {
  readonly results: GutendexBook[]
  readonly rowStates: ReadonlyMap<number, AddRowState>
  onAdd(book: GutendexBook): void
}

function ResultsList({ results, rowStates, onAdd }: ResultsListProps) {
  return (
    <ul data-slot="add-gutendex-results" className="flex flex-col gap-2">
      {results.map((book) => (
        <ResultRow
          key={`add-row-${book.id}`}
          book={book}
          state={rowStates.get(book.id) ?? { status: 'idle' }}
          onAdd={() => onAdd(book)}
        />
      ))}
    </ul>
  )
}

export function AddGutendexSheet() {
  const open = useAddBookDrawerOpen()
  const inputRef = useRef<HTMLInputElement>(null)
  const [rawQuery, setRawQuery] = useState('')
  const [filter, setFilter] = useState<LanguageFilter>('both')
  const [results, setResults] = useState<GutendexBook[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [rowStates, setRowStates] = useState<Map<number, AddRowState>>(new Map())

  const debouncedQuery = useDebouncedValue(rawQuery, SEARCH_DEBOUNCE_MS)
  const enabled = open && (debouncedQuery.trim().length === 0 || debouncedQuery.trim().length >= 2)

  const queryClient = useQueryClient()

  const queryKey = useMemo(
    () => ['gutendex-search', debouncedQuery.trim(), filter] as const,
    [debouncedQuery, filter],
  )

  const initialQuery = useQuery<SearchGutendexResult>({
    queryKey,
    queryFn: () => searchGutendex(searchParamsFor(debouncedQuery, filter)),
    enabled,
    staleTime: SEARCH_STALE_MS,
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    if (!initialQuery.data) return
    setResults(initialQuery.data.books)
    setNextCursor(initialQuery.data.nextCursor)
  }, [initialQuery.data])

  useEffect(() => {
    if (!open) return
    const handle = setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
    return () => clearTimeout(handle)
  }, [open])

  useEffect(() => {
    if (open) return
    setRawQuery('')
    setFilter('both')
    setResults([])
    setNextCursor(null)
    setRowStates(new Map())
  }, [open])

  const loadMoreMutation = useMutation({
    mutationFn: async (cursor: string) => {
      return searchGutendex({ ...searchParamsFor(debouncedQuery, filter), cursor })
    },
    onSuccess: (page) => {
      setResults((prev) => [...prev, ...page.books])
      setNextCursor(page.nextCursor)
    },
    onError: () => {
      toast.error(LOAD_ERROR)
    },
  })

  function setRowState(gutendexId: number, status: AddRowState['status']): void {
    setRowStates((prev) => {
      const next = new Map(prev)
      next.set(gutendexId, { status })
      return next
    })
  }

  function syncLibraryCacheWith(book: Book): void {
    const existing = queryClient.getQueryData<{ books: Book[]; nextCursor: string | null }>(
      LIBRARY_QUERY_KEY,
    )
    if (existing) {
      const alreadyPresent = existing.books.some((entry) => entry.id === book.id)
      if (!alreadyPresent) {
        queryClient.setQueryData(LIBRARY_QUERY_KEY, {
          books: [book, ...existing.books],
          nextCursor: existing.nextCursor,
        })
      }
    } else {
      queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY })
    }
  }

  function existingIdFromDuplicate(error: unknown): string | null {
    if (!(error instanceof ApiError)) return null
    if (error.slug !== 'duplicate-gutendex-id') return null
    const candidate = (error.problem as { existing_book_id?: unknown } | null)?.existing_book_id
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
  }

  const addMutation = useMutation({
    mutationFn: async (gutendexId: number): Promise<Book> => {
      try {
        return await addBook(gutendexId, makeIdempotencyKey(gutendexId))
      } catch (error) {
        // The catalog soft-deletes books, so re-adding a Gutendex id that
        // exists (active or trashed) returns 409 duplicate-gutendex-id with
        // the existing UUID. Restore is the user's intent here.
        const existingId = existingIdFromDuplicate(error)
        if (existingId !== null) {
          return await restoreBook(existingId)
        }
        throw error
      }
    },
    onMutate: (gutendexId) => {
      setRowState(gutendexId, 'pending')
    },
    onSuccess: (book: Book, gutendexId) => {
      setRowState(gutendexId, 'added')
      syncLibraryCacheWith(book)
    },
    onError: (_error, gutendexId) => {
      setRowState(gutendexId, 'error')
      toast.error(ADD_ERROR_TOAST)
    },
  })

  function handleAdd(book: GutendexBook): void {
    addMutation.mutate(book.id)
  }

  function handleLoadMore(): void {
    if (!nextCursor) return
    loadMoreMutation.mutate(nextCursor)
  }

  const isSearchPending = enabled && initialQuery.isFetching && results.length === 0
  const isLoadMorePending = loadMoreMutation.isPending
  const hasResults = results.length > 0
  const showEmpty = enabled && !initialQuery.isFetching && !initialQuery.isError && !hasResults
  const showTypePrompt =
    open && debouncedQuery.trim().length > 0 && debouncedQuery.trim().length < 2

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setAddBookDrawerOpen(true)
        } else {
          closeAddBookDrawer()
        }
      }}
    >
      <SheetContent
        side="left"
        data-slot="add-gutendex-sheet"
        className={cn('w-full sm:max-w-[480px]')}
        aria-label={SHEET_TITLE}
      >
        <SheetHeader>
          <SheetTitle className="font-serif">{SHEET_TITLE}</SheetTitle>
          <SheetDescription>{SHEET_DESCRIPTION}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-hidden px-4 pb-4">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={inputRef}
              type="search"
              data-slot="add-gutendex-search"
              aria-label={SEARCH_LABEL}
              placeholder={SEARCH_PLACEHOLDER}
              value={rawQuery}
              onChange={(event) => setRawQuery(event.target.value)}
              className="pl-8"
            />
          </div>

          <fieldset
            aria-label={FILTER_GROUP_LABEL}
            data-slot="add-gutendex-filter"
            className="flex gap-2 border-0 p-0"
          >
            {FILTER_VALUES.map((value) => {
              const active = filter === value
              return (
                <button
                  key={`filter-${value}`}
                  type="button"
                  data-slot="add-gutendex-filter-chip"
                  data-active={active}
                  data-language={value}
                  aria-pressed={active}
                  onClick={() => setFilter(value)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background hover:bg-accent',
                  )}
                >
                  {FILTER_LABELS[value]}
                </button>
              )
            })}
          </fieldset>

          <div data-slot="add-gutendex-results-region" className="flex-1 overflow-y-auto">
            {showTypePrompt && (
              <p data-slot="add-gutendex-prompt" className="text-muted-foreground text-sm">
                {TYPE_TO_SEARCH}
              </p>
            )}

            {isSearchPending && (
              <p
                data-slot="add-gutendex-loading"
                className="flex items-center gap-2 text-muted-foreground text-sm"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando…
              </p>
            )}

            {initialQuery.isError && (
              <p role="alert" data-slot="add-gutendex-error" className="text-destructive text-sm">
                {LOAD_ERROR}
              </p>
            )}

            {showEmpty && !showTypePrompt && (
              <p data-slot="add-gutendex-empty" className="text-muted-foreground text-sm">
                {NO_RESULTS}
              </p>
            )}

            {hasResults && (
              <ResultsList results={results} rowStates={rowStates} onAdd={handleAdd} />
            )}

            {hasResults && nextCursor && (
              <div className="mt-3 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-slot="add-gutendex-load-more"
                  onClick={handleLoadMore}
                  disabled={isLoadMorePending}
                >
                  {isLoadMorePending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                  {LOAD_MORE_LABEL}
                </Button>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export const _internals = {
  SHEET_TITLE,
  SHEET_DESCRIPTION,
  SEARCH_PLACEHOLDER,
  FILTER_LABELS,
  ADD_LABEL,
  ADDED_LABEL,
  ADD_ERROR_LABEL,
  LOAD_MORE_LABEL,
  NO_RESULTS,
  TYPE_TO_SEARCH,
  LOAD_ERROR,
  ADD_ERROR_TOAST,
  SEARCH_DEBOUNCE_MS,
  RESULT_LIMIT,
  searchParamsFor,
  authorList,
  makeIdempotencyKey,
  useDebouncedValue,
}
