'use client'

import { ThreadPrimitive, useMessage } from '@assistant-ui/react'
import { Menu } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { DialogusComposer } from '@/components/chat/DialogusComposer'
import { useDialogusThreadContext } from '@/components/chat/DialogusContext'
import { DialogusMessage, type DialogusMessageStatus } from '@/components/chat/DialogusMessage'
import { DialogusThread } from '@/components/chat/DialogusThread'
import { ThreadHeader } from '@/components/chat/ThreadHeader'
import { ThreadSidebar } from '@/components/chat/ThreadSidebar'
import { CitationSidePanel } from '@/components/citation/CitationSidePanel'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const EMPTY_MAIN_TITLE = 'Selecione uma conversa ou comece uma nova'
const EMPTY_MAIN_HINT = 'Escolha 1 a 3 livros e envie sua primeira pergunta.'
const SIDEBAR_DRAWER_LABEL = 'Conversas'
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

  const messageStatus = deriveMessageStatus(role, status)

  return (
    <div data-slot="dialogus-message-row" data-role={role} className="py-3">
      <DialogusMessage
        messageId={messageId}
        text={text}
        role={role}
        status={messageStatus}
        threadId={threadId ?? ''}
      />
    </div>
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
          <DialogusThread key={activeThreadId ?? 'new'} threadId={activeThreadId}>
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
