'use client'

import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useThreadCleanup } from '@/hooks/useThreadCleanup'
import type { Thread } from '@/lib/api/_schemas'
import { THREADS_QUERY_KEY } from '@/lib/query-keys'
import { useThreadMetadata } from '@/lib/thread-metadata'
import { cn } from '@/lib/utils'

const TITLE_MAX_LEN = 40
const FALLBACK_TITLE = 'Conversa sem título'
const RENAME_LABEL = 'Renomear'
const PIN_LABEL = 'Fixar'
const UNPIN_LABEL = 'Desafixar'
const DELETE_LABEL = 'Excluir'
const ROW_MENU_LABEL = 'Opções da conversa'
const DELETE_CONFIRM_TITLE = 'Excluir conversa?'
const DELETE_CONFIRM_BODY = 'Esta ação remove a conversa e os caps de spoiler do navegador.'
const DELETE_CONFIRM_ACTION = 'Excluir conversa'
const DELETE_CONFIRM_CANCEL = 'Cancelar'

export interface ThreadRowProps {
  readonly threadId: string
  readonly isActive: boolean
  onSelect(threadId: string): void
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}

function defaultTitleFromThread(thread: Thread | undefined): string {
  if (!thread) return FALLBACK_TITLE
  const raw = (thread.title ?? '').trim()
  if (raw.length === 0) return FALLBACK_TITLE
  return truncate(raw, TITLE_MAX_LEN)
}

function useThreadFromList(threadId: string): Thread | undefined {
  const query = useQuery<Thread[]>({
    queryKey: THREADS_QUERY_KEY,
    enabled: false,
  })
  return query.data?.find((thread) => thread.id === threadId)
}

interface RenameOverlayProps {
  readonly initialValue: string
  onCommit(newTitle: string): void
  onCancel(): void
}

function RenameOverlay({ initialValue, onCommit, onCancel }: RenameOverlayProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const committedRef = useRef(false)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [])

  const commit = useCallback(() => {
    if (committedRef.current) return
    committedRef.current = true
    const next = value.trim()
    if (next.length === 0 || next === initialValue.trim()) {
      onCancel()
      return
    }
    onCommit(next)
  }, [value, initialValue, onCommit, onCancel])

  return (
    <Input
      ref={inputRef}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          committedRef.current = true
          onCancel()
        }
      }}
      data-slot="thread-row-rename-input"
      aria-label="Novo título da conversa"
      className="h-8 text-sm"
    />
  )
}

export function ThreadRow({ threadId, isActive, onSelect }: ThreadRowProps) {
  const metadata = useThreadMetadata(threadId)
  const thread = useThreadFromList(threadId)
  const cleanup = useThreadCleanup(threadId)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const customTitle = metadata.data.custom_title
  const defaultTitle = defaultTitleFromThread(thread)
  const displayTitle = customTitle && customTitle.trim().length > 0 ? customTitle : defaultTitle

  const onRenameCommit = useCallback(
    async (next: string) => {
      setIsRenaming(false)
      await metadata.mutateRename(next)
    },
    [metadata],
  )

  const onPinToggle = useCallback(async () => {
    await metadata.mutatePin(!metadata.data.pinned)
  }, [metadata])

  const onDeleteConfirm = useCallback(async () => {
    setIsDeleteOpen(false)
    await cleanup.delete()
  }, [cleanup])

  return (
    <div
      data-slot="thread-row"
      data-thread-id={threadId}
      data-active={isActive}
      data-pinned={metadata.data.pinned}
      className={cn(
        'group/thread-row flex h-(--space-thread-row) items-center gap-1 rounded-md px-2',
        'hover:bg-accent/60',
        isActive && 'bg-accent',
      )}
    >
      {isRenaming ? (
        <div className="flex flex-1 items-center" data-slot="thread-row-rename-wrapper">
          <RenameOverlay
            initialValue={customTitle ?? defaultTitle}
            onCommit={onRenameCommit}
            onCancel={() => setIsRenaming(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          data-slot="thread-row-select"
          onClick={() => onSelect(threadId)}
          aria-current={isActive ? 'page' : undefined}
          aria-label={`Abrir conversa: ${displayTitle}`}
          className={cn(
            'flex flex-1 items-center truncate text-left text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <span className="truncate">{displayTitle}</span>
        </button>
      )}
      {!isRenaming && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={ROW_MENU_LABEL}
              data-slot="thread-row-menu-trigger"
              className={cn(
                'h-7 w-7 opacity-0 group-hover/thread-row:opacity-100',
                'data-[state=open]:opacity-100',
              )}
            >
              <MoreHorizontal aria-hidden className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              data-slot="thread-row-rename"
              onSelect={(event) => {
                event.preventDefault()
                setIsRenaming(true)
              }}
            >
              {RENAME_LABEL}
            </DropdownMenuItem>
            <DropdownMenuItem data-slot="thread-row-pin" onSelect={() => void onPinToggle()}>
              {metadata.data.pinned ? UNPIN_LABEL : PIN_LABEL}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-slot="thread-row-delete"
              variant="destructive"
              onSelect={(event) => {
                event.preventDefault()
                setIsDeleteOpen(true)
              }}
            >
              {DELETE_LABEL}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent size="sm" data-slot="thread-row-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{DELETE_CONFIRM_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{displayTitle}</span> —{' '}
              {DELETE_CONFIRM_BODY}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{DELETE_CONFIRM_CANCEL}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              data-slot="thread-row-delete-confirm"
              onClick={() => void onDeleteConfirm()}
            >
              {DELETE_CONFIRM_ACTION}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export const _internals = {
  TITLE_MAX_LEN,
  FALLBACK_TITLE,
  RENAME_LABEL,
  PIN_LABEL,
  UNPIN_LABEL,
  DELETE_LABEL,
  ROW_MENU_LABEL,
  DELETE_CONFIRM_TITLE,
  DELETE_CONFIRM_ACTION,
  DELETE_CONFIRM_CANCEL,
}
