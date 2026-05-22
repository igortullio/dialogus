'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { type FetchLibraryResult, fetchLibrary } from '@/lib/api/library'
import { LIBRARY_QUERY_KEY } from '@/lib/query-keys'
import { cn } from '@/lib/utils'

const EMPTY_LIBRARY_HEADING = 'Acervo vazio'
const EMPTY_LIBRARY_BODY =
  'Adicione livros do Gutendex ao seu acervo para começar a conversar com eles.'
const EMPTY_LIBRARY_CTA = 'Adicionar livros'

export interface EmptyStateCardProps {
  readonly className?: string
}

export function EmptyStateCard({ className }: EmptyStateCardProps) {
  const library = useQuery<FetchLibraryResult>({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: () => fetchLibrary({ limit: 1 }),
  })

  if (library.isPending) return null
  if ((library.data?.books.length ?? 0) > 0) return null

  return (
    <section
      data-slot="empty-state-card"
      data-state="empty-library"
      className={cn('rounded-lg border bg-card p-4', className)}
    >
      <h2 className="font-medium text-base">{EMPTY_LIBRARY_HEADING}</h2>
      <p className="mt-1 text-muted-foreground text-sm">{EMPTY_LIBRARY_BODY}</p>
      <Button asChild size="sm" className="mt-3">
        <Link href="/library" data-slot="empty-state-library-link">
          {EMPTY_LIBRARY_CTA}
        </Link>
      </Button>
    </section>
  )
}

export const _internals = {
  EMPTY_LIBRARY_HEADING,
  EMPTY_LIBRARY_BODY,
  EMPTY_LIBRARY_CTA,
}
