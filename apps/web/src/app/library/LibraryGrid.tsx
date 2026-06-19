'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { openAddBookDrawer } from '@/components/chat/add-book-drawer-store'
import { BookCard } from '@/components/library/BookCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { Book } from '@/lib/api/_schemas'
import { type FetchLibraryResult, fetchLibrary } from '@/lib/api/library'
import { LIBRARY_QUERY_KEY } from '@/lib/query-keys'
import { cn } from '@/lib/utils'

export { LIBRARY_QUERY_KEY }

const PAGE_HEADING = 'Gerenciar acervo'
const PAGE_SUBHEADING = 'Seus livros prontos para conversa.'
const BACK_TO_CHAT_LABEL = 'Voltar para a conversa'
const SEARCH_PLACEHOLDER = 'Buscar por título ou autor…'
const SEARCH_LABEL = 'Buscar no acervo'
const ADD_BUTTON_LABEL = 'Adicionar do Gutendex'
const EMPTY_HEADING = 'Você ainda não tem livros'
const EMPTY_BODY =
  'Use “Adicionar do Gutendex” para começar — o acervo aparece aqui assim que a ingestão começar.'
const EMPTY_FILTER_HEADING = 'Nenhum livro encontrado'
const EMPTY_FILTER_BODY = 'Tente outro termo ou limpe a busca para ver todo o acervo.'
const LOAD_ERROR_COPY = 'Não foi possível carregar o acervo.'

function bookMatchesQuery(book: Book, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  if (book.title.toLowerCase().includes(normalizedQuery)) return true
  return book.authors.some((author) => author.name.toLowerCase().includes(normalizedQuery))
}

function filterBooks(books: readonly Book[], query: string): readonly Book[] {
  const normalized = query.trim().toLowerCase()
  if (normalized.length === 0) return books
  return books.filter((book) => bookMatchesQuery(book, normalized))
}

const GRID_CLASSES = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

export interface LibraryGridProps {
  readonly initialData?: FetchLibraryResult
  readonly className?: string
}

export function LibraryGrid({ initialData, className }: LibraryGridProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const query = useQuery<FetchLibraryResult>({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: () => fetchLibrary(),
    initialData,
  })

  const books = query.data?.books ?? []
  const filtered = useMemo(() => filterBooks(books, searchTerm), [books, searchTerm])
  const hasBooks = books.length > 0
  const hasMatches = filtered.length > 0

  return (
    <section
      data-slot="library-page"
      className={cn('flex h-full flex-col gap-6 px-6 py-8 lg:px-10', className)}
    >
      <header data-slot="library-header" className="flex flex-col gap-4">
        <Link
          href="/"
          data-slot="library-back-link"
          className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          {BACK_TO_CHAT_LABEL}
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-2xl">{PAGE_HEADING}</h1>
          <p className="text-muted-foreground text-sm">{PAGE_SUBHEADING}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              data-slot="library-search-input"
              aria-label={SEARCH_LABEL}
              placeholder={SEARCH_PLACEHOLDER}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-8"
            />
          </div>
          <Button type="button" data-slot="library-add-button" onClick={() => openAddBookDrawer()}>
            <Plus aria-hidden className="h-4 w-4" />
            {ADD_BUTTON_LABEL}
          </Button>
        </div>
      </header>

      {query.isPending && !initialData && (
        <div data-slot="library-loading" className={GRID_CLASSES}>
          <Skeleton className="aspect-[2/3] w-full rounded-md" />
          <Skeleton className="aspect-[2/3] w-full rounded-md" />
          <Skeleton className="aspect-[2/3] w-full rounded-md" />
          <Skeleton className="aspect-[2/3] w-full rounded-md" />
        </div>
      )}

      {query.isError && (
        <p
          role="alert"
          data-slot="library-error"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-destructive text-sm"
        >
          {LOAD_ERROR_COPY}
        </p>
      )}

      {!query.isError && !query.isPending && !hasBooks && (
        <div
          data-slot="library-empty"
          className="flex flex-col items-start gap-2 rounded-md border bg-card p-6"
        >
          <h2 className="font-serif text-lg">{EMPTY_HEADING}</h2>
          <p className="text-muted-foreground text-sm">{EMPTY_BODY}</p>
          <Button type="button" size="sm" onClick={() => openAddBookDrawer()}>
            <Plus aria-hidden className="h-4 w-4" />
            {ADD_BUTTON_LABEL}
          </Button>
        </div>
      )}

      {!query.isError && hasBooks && hasMatches && (
        <ul data-slot="library-grid" className={GRID_CLASSES}>
          {filtered.map((book, index) => (
            <li key={book.id} className="contents">
              {/* First row loads covers eagerly for LCP; rest stay lazy. */}
              <BookCard book={book} priority={index < 4} />
            </li>
          ))}
        </ul>
      )}

      {!query.isError && hasBooks && !hasMatches && (
        <div data-slot="library-empty-filter" className="rounded-md border bg-card p-6 text-center">
          <h2 className="font-serif text-lg">{EMPTY_FILTER_HEADING}</h2>
          <p className="mt-1 text-muted-foreground text-sm">{EMPTY_FILTER_BODY}</p>
        </div>
      )}
    </section>
  )
}

export const _internals = {
  PAGE_HEADING,
  PAGE_SUBHEADING,
  SEARCH_PLACEHOLDER,
  SEARCH_LABEL,
  ADD_BUTTON_LABEL,
  EMPTY_HEADING,
  EMPTY_BODY,
  EMPTY_FILTER_HEADING,
  EMPTY_FILTER_BODY,
  LOAD_ERROR_COPY,
  GRID_CLASSES,
  filterBooks,
  bookMatchesQuery,
}
