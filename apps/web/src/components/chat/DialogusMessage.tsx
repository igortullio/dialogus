'use client'

import { useMemo } from 'react'
import { renderMessageBody } from '@/lib/render-message-markdown'
import { cn } from '@/lib/utils'
import { usePrefetchCitations } from './usePrefetchCitations'

export type DialogusMessageStatus = 'streaming' | 'complete' | 'incomplete'

export interface ToolActivity {
  readonly id: string
  readonly toolName: string
  readonly running: boolean
}

export interface DialogusMessageProps {
  readonly messageId: string
  readonly text: string
  readonly threadId?: string
  readonly status?: DialogusMessageStatus
  readonly className?: string
  readonly role?: 'user' | 'assistant' | 'system'
  readonly activity?: readonly ToolActivity[]
}

const TOOL_LABELS: Record<string, string> = {
  semantic_search: 'Buscando passagens',
  list_chapters: 'Consultando o índice',
  get_chapter_summary: 'Lendo resumo do capítulo',
  find_character_mentions: 'Localizando menções',
}

function describeActivity(
  activity: readonly ToolActivity[] | undefined,
  hasText: boolean,
): string | null {
  if (activity === undefined || activity.length === 0) {
    return hasText ? null : 'Pensando…'
  }
  // Prefer the most recent running tool; if none running, the agent is composing.
  for (let i = activity.length - 1; i >= 0; i--) {
    const tool = activity[i]
    if (tool?.running) {
      const label = TOOL_LABELS[tool.toolName] ?? 'Consultando'
      return `${label}…`
    }
  }
  return hasText ? null : 'Compondo resposta…'
}

export function DialogusMessage({
  messageId,
  text,
  threadId = '',
  status = 'complete',
  className,
  role = 'assistant',
  activity,
}: DialogusMessageProps) {
  // Re-render from the full message text on every render. The renderer is pure
  // and deterministic, so re-running it produces stable indexes; restarting per
  // messageId via React's reconciler is what guarantees parser state resets on
  // a new message without explicit per-id state tracking.
  const rendered = useMemo(
    () =>
      renderMessageBody(text, {
        messageId,
        threadId,
        // Markdown only applies to assistant turns. User input is rendered as
        // plain text so a typed "**asterisks**" stays literal in the question.
        markdown: role === 'assistant',
      }),
    [text, messageId, threadId, role],
  )

  usePrefetchCitations({
    chunkIds: rendered.chunkIds,
    enabled: status === 'complete' && rendered.chunkIds.length > 0,
  })

  const isStreaming = status === 'streaming' && role === 'assistant'
  const activityLabel = isStreaming ? describeActivity(activity, text.length > 0) : null
  const hasNoBody = role === 'assistant' && text.length === 0

  return (
    <article
      data-slot="dialogus-message"
      data-message-id={messageId}
      data-message-status={status}
      data-role={role}
      className={cn('mx-auto w-full max-w-[68ch] space-y-1.5', className)}
    >
      <div className="font-sans text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
        {role === 'user' ? 'Pergunta' : 'Resposta'}
      </div>
      {activityLabel !== null && (
        <div
          data-slot="dialogus-message-activity"
          aria-live="polite"
          className="flex items-center gap-2 font-sans text-[12px] text-muted-foreground"
        >
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/70"
          />
          <span className="italic">{activityLabel}</span>
        </div>
      )}
      {!hasNoBody && (
        <div
          data-slot="dialogus-message-content"
          className={cn(
            'break-words font-serif text-[15px] leading-[1.7] text-foreground',
            role === 'user'
              ? 'whitespace-pre-wrap border-l-2 border-border pl-3 italic text-muted-foreground'
              : '[&_p]:break-words',
          )}
        >
          {rendered.nodes}
          {isStreaming && text.length > 0 && (
            <span
              aria-hidden
              data-slot="dialogus-message-caret"
              className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-foreground/70 align-baseline"
            />
          )}
        </div>
      )}
    </article>
  )
}
