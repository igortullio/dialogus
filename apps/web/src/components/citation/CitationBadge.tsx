'use client'

import type { ChunkReadDto } from '@dialogus/shared/schemas/ingestion'
import { useQuery } from '@tanstack/react-query'
import { chunkQueryKey } from '@/components/chat/usePrefetchCitations'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Book } from '@/lib/api/_schemas'
import { fetchChunkById } from '@/lib/api/chunks'
import { fetchBookById } from '@/lib/api/library'
import { cn } from '@/lib/utils'
import { bookQueryKey, CitationTooltip } from './CitationTooltip'
import { openCitationPanel } from './citation-panel-state'

const HOVER_DELAY_MS = 300

export interface CitationBadgeProps {
  readonly chunkId: string
  readonly index: number
  readonly threadId: string
  readonly messageId: string
  readonly className?: string
}

export function CitationBadge({
  chunkId,
  index,
  threadId,
  messageId,
  className,
}: CitationBadgeProps) {
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

  const ariaLabel = buildAriaLabel(index, chunk.data, book.data)

  return (
    <TooltipProvider delayDuration={HOVER_DELAY_MS}>
      <Tooltip>
        <TooltipTrigger asChild>
          <sup
            data-slot="citation-badge"
            data-chunk-id={chunkId}
            data-citation-index={index}
            data-thread-id={threadId}
            data-message-id={messageId}
            className={cn('mx-0.5 inline-block leading-none align-super', className)}
          >
            <button
              type="button"
              aria-label={ariaLabel}
              onClick={() => openCitationPanel(chunkId)}
              className={cn(
                'inline-flex h-4 min-w-4 cursor-pointer items-center justify-center',
                'rounded-(--radius-cite-badge) border border-scholarly/30 bg-scholarly/10',
                'px-1 text-[0.7em] font-medium text-scholarly transition-colors',
                'hover:bg-scholarly/20 hover:border-scholarly/60',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-scholarly',
              )}
            >
              {index}
            </button>
          </sup>
        </TooltipTrigger>
        <TooltipContent
          role="tooltip"
          side="top"
          sideOffset={4}
          className="max-w-xs bg-popover p-3 text-popover-foreground shadow-md"
        >
          <CitationTooltip chunkId={chunkId} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function buildAriaLabel(
  index: number,
  chunk: ChunkReadDto | undefined,
  book: Book | undefined,
): string {
  if (!chunk) return `Citação ${index}`
  const bookTitle = book?.title ?? null
  if (bookTitle === null) return `Citação ${index}: capítulo ${chunk.chapter_ordinal}`
  return `Citação ${index}: capítulo ${chunk.chapter_ordinal} de ${bookTitle}`
}
