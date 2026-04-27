'use client'

import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { THREADS_QUERY_KEY } from '@/hooks/useThreadCleanup'
import type { Thread } from '@/lib/api/_schemas'
import { listThreads } from '@/lib/api/threads'
import { cn } from '@/lib/utils'
import { EmptyStateCard } from './EmptyStateCard'
import { ThreadRow } from './ThreadRow'

const NEW_THREAD_LABEL = 'Nova conversa'
const PINNED_GROUP_LABEL = 'Fixadas'
const RECENT_GROUP_LABEL = 'Recentes'
const LIBRARY_LINK_LABEL = 'Gerenciar acervo'
const LOAD_ERROR_COPY = 'Não foi possível carregar suas conversas.'

export interface ThreadSidebarProps {
  readonly selectedThreadId: string | null
  onSelectThread(threadId: string | null): void
  readonly className?: string
}

interface GroupedThreads {
  readonly pinned: readonly Thread[]
  readonly recent: readonly Thread[]
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

function compareUpdatedAtDesc(a: Thread, b: Thread): number {
  return toDate(b.updatedAt).getTime() - toDate(a.updatedAt).getTime()
}

function isPinned(thread: Thread): boolean {
  return thread.metadata?.pinned === true
}

function groupThreads(threads: readonly Thread[]): GroupedThreads {
  const pinned = threads.filter(isPinned).slice().sort(compareUpdatedAtDesc)
  const recent = threads
    .filter((thread) => !isPinned(thread))
    .slice()
    .sort(compareUpdatedAtDesc)
  return { pinned, recent }
}

interface ThreadGroupProps {
  readonly label: string
  readonly threads: readonly Thread[]
  readonly selectedThreadId: string | null
  onSelect(threadId: string): void
  readonly slot: string
}

function ThreadGroup({ label, threads, selectedThreadId, onSelect, slot }: ThreadGroupProps) {
  if (threads.length === 0) return null
  return (
    <div data-slot={slot} className="flex flex-col gap-1">
      <h3 className="px-2 pt-2 text-muted-foreground text-xs uppercase tracking-wide">{label}</h3>
      <ul className="flex flex-col gap-0.5">
        {threads.map((thread) => (
          <li key={thread.id}>
            <ThreadRow
              threadId={thread.id}
              isActive={selectedThreadId === thread.id}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ThreadSidebar({ selectedThreadId, onSelectThread, className }: ThreadSidebarProps) {
  const query = useQuery<Thread[]>({
    queryKey: THREADS_QUERY_KEY,
    queryFn: listThreads,
  })

  const grouped = useMemo<GroupedThreads>(() => {
    if (!query.data) return { pinned: [], recent: [] }
    return groupThreads(query.data)
  }, [query.data])

  const isEmpty = query.isSuccess && query.data.length === 0

  return (
    <aside
      data-slot="thread-sidebar"
      className={cn('flex h-full w-72 shrink-0 flex-col border-r bg-background', className)}
      aria-label="Lista de conversas"
    >
      <div className="border-b p-3">
        <Button
          type="button"
          size="sm"
          data-slot="thread-sidebar-new"
          onClick={() => onSelectThread(null)}
          className="w-full justify-start"
        >
          <Plus aria-hidden className="h-4 w-4" />
          {NEW_THREAD_LABEL}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {query.isPending && (
          <div className="flex flex-col gap-2" data-slot="thread-sidebar-loading">
            <Skeleton className="h-(--space-thread-row) w-full" />
            <Skeleton className="h-(--space-thread-row) w-full" />
            <Skeleton className="h-(--space-thread-row) w-full" />
          </div>
        )}
        {query.isError && (
          <p
            role="alert"
            data-slot="thread-sidebar-error"
            className="px-2 py-3 text-destructive text-sm"
          >
            {LOAD_ERROR_COPY}
          </p>
        )}
        {isEmpty && <EmptyStateCard />}
        {query.isSuccess && query.data.length > 0 && (
          <div className="flex flex-col gap-2">
            <ThreadGroup
              label={PINNED_GROUP_LABEL}
              threads={grouped.pinned}
              selectedThreadId={selectedThreadId}
              onSelect={onSelectThread}
              slot="thread-sidebar-pinned"
            />
            <ThreadGroup
              label={RECENT_GROUP_LABEL}
              threads={grouped.recent}
              selectedThreadId={selectedThreadId}
              onSelect={onSelectThread}
              slot="thread-sidebar-recent"
            />
          </div>
        )}
      </div>
      <div className="border-t p-3">
        <Link
          href="/library"
          data-slot="thread-sidebar-library-link"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {LIBRARY_LINK_LABEL}
        </Link>
      </div>
    </aside>
  )
}

export const _internals = {
  NEW_THREAD_LABEL,
  PINNED_GROUP_LABEL,
  RECENT_GROUP_LABEL,
  LIBRARY_LINK_LABEL,
  LOAD_ERROR_COPY,
}
