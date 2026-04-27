'use client'

import { Fragment, useMemo } from 'react'
import { initialParserState, parseStream, type Token } from '@/lib/citation-parser'
import { cn } from '@/lib/utils'
import { CitationBadgePlaceholder } from './CitationBadgePlaceholder'
import { usePrefetchCitations } from './usePrefetchCitations'

export type DialogusMessageStatus = 'streaming' | 'complete' | 'incomplete'

export interface DialogusMessageProps {
  readonly messageId: string
  readonly text: string
  readonly status?: DialogusMessageStatus
  readonly className?: string
  readonly role?: 'user' | 'assistant' | 'system'
}

interface ParsedMessage {
  readonly tokens: readonly Token[]
  readonly chunkIds: readonly string[]
}

function parseFullMessage(text: string): ParsedMessage {
  const { tokens, nextState } = parseStream(text, initialParserState())
  const finalTokens = [...tokens]
  if (nextState.kind === 'marker_pending') {
    finalTokens.push({ kind: 'unresolved', rawText: `{{${nextState.buffer}` })
  }
  const chunkIds: string[] = []
  for (const token of finalTokens) {
    if (token.kind === 'citation') chunkIds.push(token.chunkId)
  }
  return { tokens: finalTokens, chunkIds }
}

export function DialogusMessage({
  messageId,
  text,
  status = 'complete',
  className,
  role = 'assistant',
}: DialogusMessageProps) {
  // Re-parse from the full message text on every render. The parser is pure and
  // deterministic, so re-parsing produces stable token indexes; restarting from
  // initialParserState() per render is what guarantees the parser state resets
  // on a new messageId without explicit per-id state tracking.
  const parsed = useMemo(() => parseFullMessage(text), [text])

  usePrefetchCitations({
    chunkIds: parsed.chunkIds,
    enabled: status === 'complete' && parsed.chunkIds.length > 0,
  })

  let citationIndex = 0
  const nodes = parsed.tokens.map((token, idx) => {
    if (token.kind === 'text') {
      return <Fragment key={`t-${idx}`}>{token.text}</Fragment>
    }
    if (token.kind === 'citation') {
      citationIndex += 1
      return (
        <CitationBadgePlaceholder key={`c-${idx}`} chunkId={token.chunkId} index={citationIndex} />
      )
    }
    return <Fragment key={`u-${idx}`}>{token.rawText}</Fragment>
  })

  return (
    <div
      data-slot="dialogus-message"
      data-message-id={messageId}
      data-message-status={status}
      data-role={role}
      className={cn(
        'whitespace-pre-wrap break-words text-sm leading-relaxed',
        role === 'user' && 'text-foreground',
        role === 'assistant' && 'text-foreground',
        className,
      )}
    >
      {nodes}
    </div>
  )
}
