'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import { CoverFallback } from '@/components/library/CoverFallback'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Book } from '@/lib/api/_schemas'
import { fetchLibrary } from '@/lib/api/library'
import { cn } from '@/lib/utils'
import { MAX_BOOKS_PER_THREAD } from './DialogusContext'

const SOFT_LIMIT_TOOLTIP_LABEL = 'máximo 3 livros por conversa'

export interface BookPickerProps {
  readonly value: string[]
  onChange(value: string[]): void
  readonly disabled?: boolean
  onOpenAddDrawer(): void
}

interface ReadyBooksQueryResult {
  readonly books: readonly Book[]
}

async function queryReadyBooks(): Promise<ReadyBooksQueryResult> {
  const result = await fetchLibrary({ status: 'ready', limit: 32 })
  return { books: result.books }
}

function formatTriggerLabel(selectedCount: number): string {
  if (selectedCount === 0) return 'Selecionar livros'
  return `${selectedCount}/${MAX_BOOKS_PER_THREAD} livros`
}

function bookRowKey(book: Book): string {
  return `book-row-${book.id}`
}

interface BookThumbProps {
  readonly book: Book
  readonly sizeClass?: string
}

/**
 * Compact cover thumbnail used in the book picker rows and in the inline
 * selected-books strip. Falls back to the SVG `CoverFallback` if the network
 * cover URL is missing or fails to load.
 */
export function BookThumb({ book, sizeClass = 'h-10 w-7' }: BookThumbProps) {
  const [failed, setFailed] = useState(false)
  if (book.cover_url && !failed) {
    return (
      <div
        data-slot="book-thumb"
        className={cn('relative shrink-0 overflow-hidden rounded-sm border bg-muted', sizeClass)}
      >
        <Image
          src={book.cover_url}
          alt={`Capa de '${book.title}'`}
          fill
          sizes="40px"
          unoptimized
          onError={() => setFailed(true)}
          className="object-cover"
        />
      </div>
    )
  }
  return (
    <div data-slot="book-thumb-fallback" className={cn('shrink-0', sizeClass)}>
      <CoverFallback title={book.title} author={book.authors[0]?.name} className="h-full w-full" />
    </div>
  )
}

interface BookRowProps {
  readonly book: Book
  readonly selected: boolean
  readonly atLimit: boolean
  onToggle(): void
}

function BookRow({ book, selected, atLimit, onToggle }: BookRowProps) {
  const author = book.authors[0]?.name ?? 'Desconhecido'
  const blockedByLimit = atLimit && !selected
  const button = (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={blockedByLimit}
      data-book-id={book.id}
      onClick={() => {
        if (!blockedByLimit) onToggle()
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
        'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'bg-accent/60',
        blockedByLimit && 'cursor-not-allowed opacity-60',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border',
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
        )}
      >
        {selected ? '✓' : ''}
      </span>
      <BookThumb book={book} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium leading-tight">{book.title}</span>
        <span className="truncate text-muted-foreground text-xs leading-tight">{author}</span>
      </span>
    </button>
  )
  if (!blockedByLimit) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block w-full">{button}</span>
      </TooltipTrigger>
      <TooltipContent role="tooltip">{SOFT_LIMIT_TOOLTIP_LABEL}</TooltipContent>
    </Tooltip>
  )
}

export function BookPicker({
  value,
  onChange,
  disabled = false,
  onOpenAddDrawer,
}: BookPickerProps) {
  const [open, setOpen] = useState(false)
  const query = useQuery({
    queryKey: ['library', 'ready'] as const,
    queryFn: queryReadyBooks,
  })

  const atLimit = value.length >= MAX_BOOKS_PER_THREAD

  function toggle(bookId: string): void {
    if (value.includes(bookId)) {
      onChange(value.filter((id) => id !== bookId))
      return
    }
    if (atLimit) return
    onChange([...value, bookId])
  }

  const triggerLabel = formatTriggerLabel(value.length)

  return (
    <TooltipProvider delayDuration={200}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            data-slot="book-picker-trigger"
            aria-label="Selecionar livros para a conversa"
            aria-expanded={open}
          >
            {triggerLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" data-slot="book-picker-content" className="w-80 p-2">
          <div role="listbox" aria-label="Livros disponíveis" className="flex flex-col gap-1">
            {query.isPending && (
              <div className="flex items-center gap-2 px-2 py-3 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Carregando livros…
              </div>
            )}
            {query.isError && (
              <div className="px-2 py-3 text-destructive text-sm" role="alert">
                Não foi possível carregar os livros prontos.
              </div>
            )}
            {query.data?.books.length === 0 && (
              <div className="px-2 py-3 text-muted-foreground text-sm">
                Nenhum livro pronto. Adicione um do Gutendex para começar.
              </div>
            )}
            {query.data?.books.map((book) => (
              <BookRow
                key={bookRowKey(book)}
                book={book}
                selected={value.includes(book.id)}
                atLimit={atLimit}
                onToggle={() => toggle(book.id)}
              />
            ))}
          </div>
          <div className="mt-2 border-t pt-2">
            <button
              type="button"
              data-slot="book-picker-add-gutendex"
              onClick={() => {
                setOpen(false)
                onOpenAddDrawer()
              }}
              className={cn(
                'w-full rounded-md px-2 py-2 text-left text-sm',
                'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              + Adicionar do Gutendex
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  )
}

export interface SelectedBooksInlineProps {
  readonly bookIds: readonly string[]
}

/**
 * Read-only strip showing the books bound to an existing thread. Used in the
 * composer once a conversation has started — the picker is intentionally
 * absent because changing books on an existing thread is not supported (the
 * user must open a new conversation to switch books).
 */
export function SelectedBooksInline({ bookIds }: SelectedBooksInlineProps) {
  // Reuse the picker's library cache so we don't pay a second round-trip just
  // to render the same titles the user already saw when picking.
  const query = useQuery({
    queryKey: ['library', 'ready'] as const,
    queryFn: queryReadyBooks,
  })

  if (bookIds.length === 0) return null

  const byId = new Map(query.data?.books.map((b) => [b.id, b]) ?? [])
  return (
    <div
      data-slot="selected-books-inline"
      role="group"
      aria-label="Livros desta conversa"
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      {bookIds.map((id) => {
        const book = byId.get(id)
        if (!book) {
          return (
            <span
              key={`selected-book-missing-${id}`}
              data-slot="selected-book-missing"
              className="text-muted-foreground text-xs"
            >
              Livro indisponível
            </span>
          )
        }
        return (
          <div
            key={`selected-book-${book.id}`}
            data-slot="selected-book"
            data-book-id={book.id}
            className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1"
          >
            <BookThumb book={book} sizeClass="h-9 w-6" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="max-w-[180px] truncate font-medium">{book.title}</span>
              <span className="max-w-[180px] truncate text-muted-foreground text-xs">
                {book.authors[0]?.name ?? 'Desconhecido'}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export const _internals = {
  SOFT_LIMIT_TOOLTIP_LABEL,
}
