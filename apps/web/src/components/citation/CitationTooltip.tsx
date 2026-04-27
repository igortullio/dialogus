'use client'

import type { ChunkReadDto } from '@dialogus/shared/schemas/ingestion'
import { useQuery } from '@tanstack/react-query'
import { RotateCw } from 'lucide-react'
import { chunkQueryKey } from '@/components/chat/usePrefetchCitations'
import { Skeleton } from '@/components/ui/skeleton'
import type { Book } from '@/lib/api/_schemas'
import { fetchChunkById } from '@/lib/api/chunks'
import { fetchBookById } from '@/lib/api/library'
import { cn } from '@/lib/utils'

const EXCERPT_MAX = 200

export function bookQueryKey(bookId: string): readonly ['book', string] {
  return ['book', bookId]
}

export interface CitationTooltipProps {
  readonly chunkId: string
  readonly className?: string
}

export function CitationTooltip({ chunkId, className }: CitationTooltipProps) {
  const chunk = useQuery<ChunkReadDto>({
    queryKey: chunkQueryKey(chunkId),
    queryFn: () => fetchChunkById(chunkId),
  })

  const bookId = chunk.data?.book_id ?? ''
  const book = useQuery<Book>({
    queryKey: bookQueryKey(bookId),
    queryFn: () => fetchBookById(bookId),
    enabled: chunk.isSuccess && bookId.length > 0,
  })

  if (chunk.isError) {
    return (
      <div
        data-slot="citation-tooltip-error"
        className={cn('flex items-center gap-2 text-xs', className)}
      >
        <span>Erro ao carregar citação</span>
        <button
          type="button"
          aria-label="Tentar novamente"
          onClick={() => {
            void chunk.refetch()
          }}
          className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-background/20"
        >
          <RotateCw aria-hidden className="h-3 w-3" />
        </button>
      </div>
    )
  }

  if (chunk.isPending || !chunk.data) {
    return (
      <div data-slot="citation-tooltip-loading" className={cn('flex flex-col gap-1', className)}>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-40" />
      </div>
    )
  }

  const excerpt = truncate(chunk.data.text, EXCERPT_MAX)
  const bookTitle = book.data?.title ?? null

  return (
    <div
      data-slot="citation-tooltip"
      className={cn('flex max-w-xs flex-col gap-1 text-xs leading-snug', className)}
    >
      {bookTitle ? (
        <span data-slot="citation-tooltip-book" className="font-serif italic">
          {bookTitle}
        </span>
      ) : null}
      <span data-slot="citation-tooltip-chapter" className="font-medium">
        {`Cap. ${chunk.data.chapter_ordinal} — ${chunk.data.chapter_title}`}
      </span>
      <span data-slot="citation-tooltip-excerpt" className="text-balance opacity-90">
        {excerpt}
      </span>
    </div>
  )
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}…`
}
