'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
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
      <span className="flex flex-col">
        <span className="font-medium leading-tight">{book.title}</span>
        <span className="text-muted-foreground text-xs leading-tight">{author}</span>
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

export const _internals = {
  SOFT_LIMIT_TOOLTIP_LABEL,
}
