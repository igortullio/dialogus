'use client'

import type { UIMessage } from '@ai-sdk/react'
import { AssistantRuntimeProvider, ThreadPrimitive } from '@assistant-ui/react'
import { AssistantChatTransport, useChatRuntime } from '@assistant-ui/react-ai-sdk'
import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { mastraBaseUrl } from '@/lib/api/_envelope'
import { THREADS_QUERY_KEY } from '@/lib/query-keys'
import { readAllSpoilerCaps } from '@/lib/spoiler-cap'
import { cn } from '@/lib/utils'
import { openAddBookDrawer } from './add-book-drawer-store'
import {
  DialogusThreadContextProvider,
  type DialogusThreadContextValue,
  MAX_BOOKS_PER_THREAD,
} from './DialogusContext'

const STREAM_PATH = '/api/agents/dialogusAgent/stream'
const RESOURCE_ID = 'owner'

function newThreadId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `thread-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function writeThreadMetadata(threadId: string, bookIds: readonly string[]): Promise<void> {
  // Mastra's POST /threads ignores client-provided ids and always generates a
  // fresh uuid, so pre-creating the thread is impossible. Instead the stream
  // call creates the thread implicitly (via `memory.thread = effectiveThreadId`)
  // and we PATCH metadata afterwards. PATCH is safe because by the time
  // onFinish fires the implicit create has committed.
  const url = `${mastraBaseUrl().replace(/\/+$/, '')}/api/memory/threads/${threadId}?agentId=dialogusAgent`
  try {
    await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        metadata: { book_ids: bookIds, pinned: false, custom_title: null },
      }),
    })
  } catch {
    // Best-effort: if Mastra is down we still let the stream proceed; the
    // user-facing error from the stream itself is enough.
  }
}

export interface InitialMessage {
  readonly id: string
  readonly role: 'user' | 'assistant' | 'system'
  readonly text: string
}

export interface DialogusThreadProps {
  readonly threadId?: string | null
  readonly initialBookIds?: readonly string[]
  readonly initialMessages?: readonly InitialMessage[]
  readonly className?: string
  readonly children: ReactNode
}

interface SendStateRef {
  threadId: string | null
  bookIds: string[]
}

interface PersistenceRef {
  effectiveThreadId: string | null
  metadataWritten: boolean
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

function toUIMessage(msg: InitialMessage): UIMessage {
  return {
    id: msg.id,
    role: msg.role,
    parts: [{ type: 'text', text: msg.text }],
  } as UIMessage
}

export function DialogusThread({
  threadId = null,
  initialBookIds = [],
  initialMessages,
  className,
  children,
}: DialogusThreadProps) {
  const [bookIds, setBookIdsState] = useState<string[]>(() =>
    initialBookIds.slice(0, MAX_BOOKS_PER_THREAD),
  )

  // For a new conversation the thread id is minted lazily on first send and
  // kept in persistenceRef. Mirror it into state once the first turn finishes
  // so the thread header (book strip + spoiler control) renders this session
  // instead of only after the user reopens the thread. Kept as local state —
  // not lifted to the parent's `key` — so the runtime is never remounted.
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null)

  const sendStateRef = useRef<SendStateRef>({ threadId, bookIds })
  sendStateRef.current = { threadId, bookIds }

  // Persistence ref: effectiveThreadId is the id we actually send to Mastra.
  // For an existing thread it equals the prop; for a new conversation we
  // generate one lazily on first send so the thread record can be persisted.
  const persistenceRef = useRef<PersistenceRef>({
    effectiveThreadId: threadId,
    // Existing threads already had metadata written when they were first
    // created; only newly-minted threadIds need the post-stream PATCH.
    metadataWritten: threadId !== null,
  })

  const queryClient = useQueryClient()

  const setBookIds = useCallback((ids: string[]) => {
    setBookIdsState(ids.slice(0, MAX_BOOKS_PER_THREAD))
  }, [])

  const transport = useMemo(
    () =>
      new AssistantChatTransport<UIMessage>({
        api: STREAM_PATH,
        prepareSendMessagesRequest: ({ messages, body }) => {
          const { bookIds: currentBookIds } = sendStateRef.current
          const lastMessage = messages[messages.length - 1]
          const messageText = lastMessage ? extractMessageText(lastMessage) : ''

          let { effectiveThreadId } = persistenceRef.current
          if (effectiveThreadId === null) {
            effectiveThreadId = newThreadId()
            persistenceRef.current.effectiveThreadId = effectiveThreadId
          }

          const spoiler_caps = readAllSpoilerCaps(effectiveThreadId)

          // Note: thread is created implicitly by the stream (memory.thread).
          // Metadata is written in onFinish where the thread is guaranteed to
          // exist — PATCHing before that loses to a race and returns 404.

          const requestBody: Record<string, unknown> = {
            ...(body ?? {}),
            messages: messages.map((m) => ({ role: m.role, content: extractMessageText(m) })),
            message: messageText,
            // Mastra v1.28 dropped top-level `threadId`/`resourceId` from
            // /api/agents/:id/stream — they're only honored by the legacy
            // endpoint. The current endpoint binds memory via `memory`, and
            // without this binding messages are never persisted and
            // `generateTitle` never fires.
            memory: { thread: effectiveThreadId, resource: RESOURCE_ID },
            requestContext: { book_ids: currentBookIds, spoiler_caps },
            // Legacy snake_case mirrors kept for the route's prefix builder.
            book_ids: currentBookIds,
            spoiler_caps,
          }
          return { body: requestBody }
        },
      }),
    [],
  )

  // Hydrate the runtime with prior turns from Mastra Memory. Computed once
  // per mount via useMemo (the runtime ignores subsequent identity changes
  // anyway). New conversations pass undefined and start empty.
  // biome-ignore lint/correctness/useExhaustiveDependencies: snapshot per mount
  const seedMessages = useMemo<UIMessage[] | undefined>(() => {
    if (!initialMessages || initialMessages.length === 0) return undefined
    return initialMessages.map(toUIMessage)
  }, [])

  const runtime = useChatRuntime({
    transport,
    messages: seedMessages,
    onError: (error: Error) => {
      toast.error(error.message || 'Erro durante a conversa')
    },
    onFinish: () => {
      const { effectiveThreadId, metadataWritten } = persistenceRef.current
      const { bookIds: currentBookIds } = sendStateRef.current
      // Brand-new conversation: surface the freshly-minted thread id to the
      // context so the header renders now (it keys off threadId !== null).
      if (threadId === null && effectiveThreadId !== null) {
        setCreatedThreadId(effectiveThreadId)
      }
      // Write metadata once per thread, only on the first finish. Subsequent
      // turns must not clobber custom_title / pinned set by the user later.
      if (effectiveThreadId !== null && !metadataWritten) {
        persistenceRef.current.metadataWritten = true
        void writeThreadMetadata(effectiveThreadId, currentBookIds).finally(() => {
          // Title generation (`generateTitle: true`) is also async; refresh
          // once the metadata write completes so the sidebar picks up both
          // the new title and book_ids in one go.
          queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEY })
        })
      } else {
        queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEY })
      }
    },
  })

  // Prop id for an existing thread; otherwise the lazily-minted id once the
  // first turn has created the thread.
  const resolvedThreadId = threadId ?? createdThreadId
  const contextValue = useMemo<DialogusThreadContextValue>(
    () => ({
      threadId: resolvedThreadId,
      bookIds,
      setBookIds,
      isExistingThread: resolvedThreadId !== null,
      openAddBookDrawer,
    }),
    [resolvedThreadId, bookIds, setBookIds],
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
