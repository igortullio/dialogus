'use client'

import type { ChunkReadDto } from '@dialogus/shared/schemas/ingestion'
import { useQuery } from '@tanstack/react-query'
import { RotateCw } from 'lucide-react'
import { chunkQueryKey } from '@/components/chat/usePrefetchCitations'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { Book } from '@/lib/api/_schemas'
import { fetchChunkById } from '@/lib/api/chunks'
import { fetchBookById } from '@/lib/api/library'
import { cn } from '@/lib/utils'
import { bookQueryKey } from './CitationTooltip'
import {
  closeCitationPanel,
  closeUnresolvedPanel,
  useCitationPanel,
  useUnresolvedPanel,
} from './citation-panel-state'

const DESKTOP_BREAKPOINT = '(min-width: 1024px)'
const UNRESOLVED_TITLE = 'Citação não-resolvida'
const UNRESOLVED_DESCRIPTION =
  'Esta citação faz referência a um trecho que não foi encontrado nos resultados desta resposta.'

export function CitationSidePanel() {
  const { openChunkId } = useCitationPanel()
  const unresolved = useUnresolvedPanel()
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT)
  const side = isDesktop ? 'right' : 'bottom'

  if (openChunkId !== null) {
    return (
      <Sheet
        open
        onOpenChange={(next) => {
          if (!next) closeCitationPanel()
        }}
      >
        <SheetContent
          data-slot="citation-side-panel"
          data-panel-kind="chunk"
          data-panel-side={side}
          side={side}
          onPointerDownOutside={(event) => {
            event.preventDefault()
          }}
          onInteractOutside={(event) => {
            event.preventDefault()
          }}
          className={cn(
            isDesktop ? 'w-full sm:max-w-[480px]' : 'h-3/4 max-h-[80vh]',
            'overflow-y-auto',
          )}
        >
          <ChunkPanelBody chunkId={openChunkId} />
        </SheetContent>
      </Sheet>
    )
  }

  if (unresolved.isOpen) {
    return (
      <Sheet
        open
        onOpenChange={(next) => {
          if (!next) closeUnresolvedPanel()
        }}
      >
        <SheetContent
          data-slot="citation-side-panel"
          data-panel-kind="unresolved"
          data-panel-side={side}
          side={side}
          onPointerDownOutside={(event) => {
            event.preventDefault()
          }}
          onInteractOutside={(event) => {
            event.preventDefault()
          }}
          className={cn(
            isDesktop ? 'w-full sm:max-w-[480px]' : 'h-1/2 max-h-[60vh]',
            'overflow-y-auto',
          )}
          aria-label={UNRESOLVED_TITLE}
        >
          <SheetHeader>
            <SheetTitle>{UNRESOLVED_TITLE}</SheetTitle>
            <SheetDescription>{UNRESOLVED_DESCRIPTION}</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    )
  }

  return null
}

interface ChunkPanelBodyProps {
  readonly chunkId: string
}

function ChunkPanelBody({ chunkId }: ChunkPanelBodyProps) {
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
      <div data-slot="citation-side-panel-error" className="flex flex-col gap-3 p-6">
        <SheetHeader className="p-0">
          <SheetTitle>Erro ao carregar citação</SheetTitle>
          <SheetDescription>Não foi possível recuperar este trecho do acervo.</SheetDescription>
        </SheetHeader>
        <button
          type="button"
          onClick={() => {
            void chunk.refetch()
          }}
          className="inline-flex w-fit items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <RotateCw aria-hidden className="h-4 w-4" />
          Tentar novamente
        </button>
      </div>
    )
  }

  if (chunk.isPending || !chunk.data) {
    return (
      <div data-slot="citation-side-panel-loading" className="flex flex-col gap-3 p-6">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const bookTitle = book.data?.title ?? null

  return (
    <div data-slot="citation-side-panel-content" className="flex flex-col gap-4 p-6">
      <SheetHeader className="gap-1 p-0">
        {bookTitle ? (
          <span className="font-serif text-sm italic text-muted-foreground">{bookTitle}</span>
        ) : null}
        <SheetTitle>{`Cap. ${chunk.data.chapter_ordinal} — ${chunk.data.chapter_title}`}</SheetTitle>
      </SheetHeader>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {chunk.data.text}
      </p>
      {/* Surrounding context (chunk_id ± 1) deferred to Phase 2: chunk IDs are
          UUIDs and the chunks API does not currently advertise neighbors. */}
    </div>
  )
}
