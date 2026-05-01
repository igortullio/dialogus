'use client'

import type { UIMessage } from '@ai-sdk/react'
import { AssistantRuntimeProvider, ThreadPrimitive } from '@assistant-ui/react'
import { AssistantChatTransport, useChatRuntime } from '@assistant-ui/react-ai-sdk'
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { readAllSpoilerCaps } from '@/lib/spoiler-cap'
import { cn } from '@/lib/utils'
import { openAddBookDrawer } from './add-book-drawer-store'
import {
  DialogusThreadContextProvider,
  type DialogusThreadContextValue,
  MAX_BOOKS_PER_THREAD,
} from './DialogusContext'

const STREAM_PATH = '/api/agents/dialogusAgent/stream'

export interface DialogusThreadProps {
  readonly threadId?: string | null
  readonly initialBookIds?: readonly string[]
  readonly className?: string
  readonly children: ReactNode
}

interface SendStateRef {
  threadId: string | null
  bookIds: string[]
}

function extractMessageText(message: UIMessage): string {
  const parts = (message as unknown as { parts?: ReadonlyArray<unknown> }).parts
  if (!Array.isArray(parts)) return ''
  let out = ''
  for (const part of parts) {
    if (
      part &&
      typeof part === 'object' &&
      'type' in part &&
      (part as { type: unknown }).type === 'text'
    ) {
      const text = (part as { text?: unknown }).text
      if (typeof text === 'string') out += text
    }
  }
  return out
}

export function DialogusThread({
  threadId = null,
  initialBookIds = [],
  className,
  children,
}: DialogusThreadProps) {
  const [bookIds, setBookIdsState] = useState<string[]>(() =>
    initialBookIds.slice(0, MAX_BOOKS_PER_THREAD),
  )

  const sendStateRef = useRef<SendStateRef>({ threadId, bookIds })
  sendStateRef.current = { threadId, bookIds }

  const setBookIds = useCallback((ids: string[]) => {
    setBookIdsState(ids.slice(0, MAX_BOOKS_PER_THREAD))
  }, [])

  const transport = useMemo(
    () =>
      new AssistantChatTransport<UIMessage>({
        api: STREAM_PATH,
        prepareSendMessagesRequest: ({ messages, body }) => {
          const { threadId: currentThreadId, bookIds: currentBookIds } = sendStateRef.current
          const lastMessage = messages[messages.length - 1]
          const messageText = lastMessage ? extractMessageText(lastMessage) : ''
          const spoiler_caps = currentThreadId !== null ? readAllSpoilerCaps(currentThreadId) : {}
          const requestBody: Record<string, unknown> = {
            ...(body ?? {}),
            messages: messages.map((m) => ({ role: m.role, content: extractMessageText(m) })),
            message: messageText,
            book_ids: currentBookIds,
            spoiler_caps,
          }
          if (currentThreadId !== null) requestBody.thread_id = currentThreadId
          return { body: requestBody }
        },
      }),
    [],
  )

  const runtime = useChatRuntime({
    transport,
    onError: (error: Error) => {
      toast.error(error.message || 'Erro durante a conversa')
    },
  })

  const contextValue = useMemo<DialogusThreadContextValue>(
    () => ({
      threadId,
      bookIds,
      setBookIds,
      isExistingThread: threadId !== null,
      openAddBookDrawer,
    }),
    [threadId, bookIds, setBookIds],
  )

  return (
    <DialogusThreadContextProvider value={contextValue}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className={cn('flex h-full flex-col', className)}>
          {children}
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
    </DialogusThreadContextProvider>
  )
}
