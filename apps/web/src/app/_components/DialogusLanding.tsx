'use client'

import { ThreadPrimitive, useMessage } from '@assistant-ui/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Menu } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { DialogusComposer } from '@/components/chat/DialogusComposer'
import { useDialogusThreadContext } from '@/components/chat/DialogusContext'
import { DialogusMessage, type DialogusMessageStatus } from '@/components/chat/DialogusMessage'
import {
  DialogusThread,
  type InitialMessage as ThreadInitialMessage,
} from '@/components/chat/DialogusThread'
import { ThreadHeader } from '@/components/chat/ThreadHeader'
import { ThreadSidebar } from '@/components/chat/ThreadSidebar'
import { CitationSidePanel } from '@/components/citation/CitationSidePanel'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { Thread } from '@/lib/api/_schemas'
import { fetchThreadMessages, type ThreadMessage } from '@/lib/api/threads'
import { THREADS_QUERY_KEY } from '@/lib/query-keys'

const EMPTY_MAIN_TITLE = 'Selecione uma conversa ou comece uma nova'
const EMPTY_MAIN_HINT = 'Escolha 1 a 3 livros e envie sua primeira pergunta.'
const SIDEBAR_DRAWER_LABEL = 'Conversas'
const SIDEBAR_DRAWER_DESCRIPTION =
  'Lista de conversas anteriores. Selecione uma para retomar ou crie uma nova.'
const HAMBURGER_LABEL = 'Abrir conversas'

function deriveMessageStatus(
  role: 'system' | 'user' | 'assistant',
  status: { type: string } | undefined,
): DialogusMessageStatus {
  if (role !== 'assistant') return 'complete'
  if (!status) return 'complete'
  if (status.type === 'running') return 'streaming'
  if (status.type === 'incomplete') return 'incomplete'
  return 'complete'
}

interface ToolActivity {
  readonly id: string
  readonly toolName: string
  readonly running: boolean
}

function extractActivity(content: ReadonlyArray<unknown>): readonly ToolActivity[] {
  const out: ToolActivity[] = []
  for (const part of content) {
    if (
      part &&
      typeof part === 'object' &&
      'type' in part &&
      (part as { type: unknown }).type === 'tool-call'
    ) {
      const toolPart = part as {
        toolCallId?: string
        toolName?: string
        result?: unknown
      }
      if (typeof toolPart.toolCallId === 'string' && typeof toolPart.toolName === 'string') {
        out.push({
          id: toolPart.toolCallId,
          toolName: toolPart.toolName,
          running: toolPart.result === undefined,
        })
      }
    }
  }
  return out
}

function DialogusMessageAdapter() {
  const { threadId } = useDialogusThreadContext()
  const messageId = useMessage((s) => s.id)
  const role = useMessage((s) => s.role)
  const content = useMessage((s) => s.content)
  const status = useMessage((s) => (s.role === 'assistant' ? s.status : undefined))

  const text = useMemo(() => {
    let out = ''
    for (const part of content) {
      if (part.type === 'text') out += part.text
    }
    return out
  }, [content])

  const activity = useMemo(() => extractActivity(content), [content])

  const messageStatus = deriveMessageStatus(role, status)

  return (
    <div data-slot="dialogus-message-row" data-role={role} className="py-5 first:pt-8">
      <DialogusMessage
        messageId={messageId}
        text={text}
        role={role}
        status={messageStatus}
        threadId={threadId ?? ''}
        activity={activity}
      />
    </div>
  )
}

function toInitialMessage(msg: ThreadMessage): ThreadInitialMessage | null {
  if (msg.role !== 'user' && msg.role !== 'assistant' && msg.role !== 'system') return null
  return { id: msg.id, role: msg.role, text: msg.text }
}

interface ThreadShellProps {
  readonly threadId: string | null
}

function ThreadShell({ threadId }: ThreadShellProps) {
  const queryClient = useQueryClient()
  const messagesQuery = useQuery<ThreadMessage[]>({
    queryKey: ['thread-messages', threadId ?? ''],
    queryFn: () => (threadId !== null ? fetchThreadMessages(threadId) : Promise.resolve([])),
    enabled: threadId !== null,
    staleTime: Number.POSITIVE_INFINITY,
  })

  // Read book_ids for this thread from the shared THREADS_QUERY_KEY cache
  // populated by ThreadSidebar. New conversations have no thread row yet.
  const initialBookIds = (() => {
    if (threadId === null) return undefined
    const threads = queryClient.getQueryData<Thread[]>(THREADS_QUERY_KEY)
    const found = threads?.find((t) => t.id === threadId)
    return found?.metadata?.book_ids
  })()

  // For an existing thread, wait for the message fetch before mounting the
  // runtime — the runtime initialises with `messages` only once on mount, so
  // mounting before fetch resolves leaves the conversation visually empty
  // until the user reloads.
  const ready = threadId === null || messagesQuery.isSuccess || messagesQuery.isError

  if (!ready) {
    return (
      <div
        data-slot="thread-loading"
        className="flex h-full items-center justify-center text-muted-foreground text-sm"
      >
        Carregando conversa…
      </div>
    )
  }

  const initialMessages =
    threadId !== null && messagesQuery.data
      ? messagesQuery.data
          .map(toInitialMessage)
          .filter((m): m is ThreadInitialMessage => m !== null)
      : undefined

  return (
    <DialogusThread
      key={threadId ?? 'new'}
      threadId={threadId}
      initialBookIds={initialBookIds}
      initialMessages={initialMessages}
    >
      <ThreadHeader />
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4">
        <ThreadPrimitive.If empty>
          <EmptyChatMain />
        </ThreadPrimitive.If>
        <ThreadPrimitive.If empty={false}>
          <ThreadPrimitive.Messages components={{ Message: DialogusMessageAdapter }} />
        </ThreadPrimitive.If>
      </ThreadPrimitive.Viewport>
      <DialogusComposer />
    </DialogusThread>
  )
}

function EmptyChatMain() {
  return (
    <div
      data-slot="empty-chat-main"
      className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center"
    >
      <p className="font-serif text-foreground text-lg">{EMPTY_MAIN_TITLE}</p>
      <p className="text-muted-foreground text-sm">{EMPTY_MAIN_HINT}</p>
    </div>
  )
}

export function DialogusLanding() {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const handleSelectThread = useCallback((id: string | null) => {
    setActiveThreadId(id)
    setMobileSidebarOpen(false)
  }, [])

  return (
    <div
      data-slot="dialogus-landing"
      className="flex h-screen w-full overflow-hidden bg-background"
    >
      <div
        data-slot="dialogus-desktop-sidebar"
        className="hidden h-full w-[280px] shrink-0 lg:flex"
      >
        <ThreadSidebar
          selectedThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
          className="w-full"
        />
      </div>

      <Sheet open={isMobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent
          side="left"
          data-slot="dialogus-mobile-sidebar"
          className="p-0 sm:max-w-[300px]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{SIDEBAR_DRAWER_LABEL}</SheetTitle>
            <SheetDescription>{SIDEBAR_DRAWER_DESCRIPTION}</SheetDescription>
          </SheetHeader>
          <ThreadSidebar
            selectedThreadId={activeThreadId}
            onSelectThread={handleSelectThread}
            className="w-full"
          />
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          data-slot="dialogus-mobile-header"
          className="flex items-center gap-2 border-b px-3 py-2 lg:hidden"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-slot="dialogus-mobile-trigger"
            aria-label={HAMBURGER_LABEL}
            onClick={() => setMobileSidebarOpen(true)}
          >
            <Menu aria-hidden className="h-4 w-4" />
          </Button>
          <span className="font-serif text-sm">dIAlogus</span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <ThreadShell threadId={activeThreadId} />
        </div>
      </main>

      <CitationSidePanel />
    </div>
  )
}

export const _internals = {
  EMPTY_MAIN_TITLE,
  EMPTY_MAIN_HINT,
  SIDEBAR_DRAWER_LABEL,
  HAMBURGER_LABEL,
  deriveMessageStatus,
}
