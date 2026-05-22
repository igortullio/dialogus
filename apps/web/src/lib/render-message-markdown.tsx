import { Fragment, type ReactNode } from 'react'
import { CitationBadge } from '@/components/citation/CitationBadge'
import { initialParserState, parseStream, type Token } from './citation-parser'

const CITE_OPEN = ''
const CITE_CLOSE = ''

interface CitationSpec {
  readonly index: number
  readonly chunkId: string
}

interface BuildResult {
  readonly source: string
  readonly citations: readonly CitationSpec[]
  readonly chunkIds: readonly string[]
}

function buildMarkdownSource(text: string): BuildResult {
  const { tokens, nextState } = parseStream(text, initialParserState())
  const finalTokens: Token[] = [...tokens]
  if (nextState.kind === 'marker_pending') {
    finalTokens.push({ kind: 'unresolved', rawText: `{{${nextState.buffer}` })
  }
  let source = ''
  const citations: CitationSpec[] = []
  let citationIndex = 0
  for (const token of finalTokens) {
    if (token.kind === 'text') {
      source += token.text
    } else if (token.kind === 'citation') {
      citationIndex += 1
      citations.push({ index: citationIndex, chunkId: token.chunkId })
      source += `${CITE_OPEN}${citationIndex}${CITE_CLOSE}`
    } else {
      source += token.rawText
    }
  }
  return { source, citations, chunkIds: citations.map((c) => c.chunkId) }
}

export interface RenderContext {
  readonly threadId: string
  readonly messageId: string
  readonly citations: ReadonlyMap<number, CitationSpec>
  readonly keyPrefix: string
}

const INLINE_PATTERN = `\\*\\*([^*\\n]+?)\\*\\*|\\*([^*\\n]+?)\\*|${CITE_OPEN}(\\d+)${CITE_CLOSE}`

// Content-derived key. djb2 hash → base36 string. Used so React reconciliation
// keys are stable across streaming re-renders (which extend the text, never
// reorder it) without relying on array indexes.
function contentKey(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i += 1) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

function renderInline(text: string, ctx: RenderContext): ReactNode[] {
  // Build a fresh regex per call: a global RegExp is stateful (`lastIndex`),
  // and recursive calls (bold/italic content rendered inline) would otherwise
  // step on the parent loop's iteration position.
  const re = new RegExp(INLINE_PATTERN, 'g')
  const out: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null = re.exec(text)
  let key = 0
  while (match !== null) {
    if (match.index > last) {
      out.push(
        <Fragment key={`${ctx.keyPrefix}-t-${key++}`}>{text.slice(last, match.index)}</Fragment>,
      )
    }
    if (match[1] !== undefined) {
      out.push(
        <strong key={`${ctx.keyPrefix}-b-${key++}`} className="font-semibold text-foreground">
          {renderInline(match[1], { ...ctx, keyPrefix: `${ctx.keyPrefix}-b${key}` })}
        </strong>,
      )
    } else if (match[2] !== undefined) {
      out.push(
        <em key={`${ctx.keyPrefix}-i-${key++}`} className="italic">
          {renderInline(match[2], { ...ctx, keyPrefix: `${ctx.keyPrefix}-i${key}` })}
        </em>,
      )
    } else if (match[3] !== undefined) {
      const index = Number(match[3])
      const spec = ctx.citations.get(index)
      if (spec !== undefined) {
        out.push(
          <CitationBadge
            key={`${ctx.keyPrefix}-c-${key++}`}
            chunkId={spec.chunkId}
            index={spec.index}
            threadId={ctx.threadId}
            messageId={ctx.messageId}
          />,
        )
      }
    }
    last = match.index + match[0].length
    match = re.exec(text)
  }
  if (last < text.length) {
    out.push(<Fragment key={`${ctx.keyPrefix}-t-${key++}`}>{text.slice(last)}</Fragment>)
  }
  return out
}

function renderBlocks(source: string, ctx: Omit<RenderContext, 'keyPrefix'>): ReactNode[] {
  const trimmed = source.replace(/^\n+|\n+$/g, '')
  if (trimmed.length === 0) return []
  const blocks = trimmed.split(/\n{2,}/)
  const out: ReactNode[] = []
  blocks.forEach((rawBlock, blockIdx) => {
    const block = rawBlock.replace(/^\n+|\n+$/g, '')
    if (block.length === 0) return
    const blockKey = `b${blockIdx}`
    const lines = block.split('\n')

    // Skip horizontal rules silently — disallowed by the system prompt but
    // older content may still emit them.
    if (/^\s*---+\s*$/.test(block)) return

    // Strip leading heading markers if the model slips. Render the remaining
    // text as a paragraph so meaning is not lost.
    const headingStripped = block.replace(/^#{1,6}\s+/gm, '')
    const linesNorm = headingStripped.split('\n')

    if (lines.every((l) => l.startsWith('> '))) {
      const inner = lines.map((l) => l.slice(2)).join('\n')
      out.push(
        <blockquote
          key={blockKey}
          className="my-3 border-l-2 border-border/80 pl-3 italic text-muted-foreground"
        >
          {renderInlineMultiline(inner, { ...ctx, keyPrefix: blockKey })}
        </blockquote>,
      )
      return
    }

    if (lines.every((l) => /^[-*]\s+/.test(l))) {
      out.push(
        <ul key={blockKey} className="my-2 list-disc space-y-1 pl-6 marker:text-muted-foreground">
          {lines.map((l) => {
            const lineKey = contentKey(l)
            return (
              <li key={`${blockKey}-li-${lineKey}`}>
                {renderInline(l.replace(/^[-*]\s+/, ''), {
                  ...ctx,
                  keyPrefix: `${blockKey}-li${lineKey}`,
                })}
              </li>
            )
          })}
        </ul>,
      )
      return
    }

    out.push(
      <p key={blockKey} className="[&:not(:first-child)]:mt-3">
        {renderInlineMultiline(linesNorm.join('\n'), { ...ctx, keyPrefix: blockKey })}
      </p>,
    )
  })
  return out
}

function renderInlineMultiline(text: string, ctx: RenderContext): ReactNode[] {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  for (const line of lines) {
    const lineKey = contentKey(line)
    if (out.length > 0) out.push(<br key={`${ctx.keyPrefix}-br-${lineKey}`} />)
    out.push(
      <Fragment key={`${ctx.keyPrefix}-l-${lineKey}`}>
        {renderInline(line, { ...ctx, keyPrefix: `${ctx.keyPrefix}-l${lineKey}` })}
      </Fragment>,
    )
  }
  return out
}

export interface RenderedMessage {
  readonly nodes: ReactNode[]
  readonly chunkIds: readonly string[]
}

export interface RenderOptions {
  readonly threadId: string
  readonly messageId: string
  readonly markdown: boolean
}

export function renderMessageBody(text: string, options: RenderOptions): RenderedMessage {
  const { source, citations, chunkIds } = buildMarkdownSource(text)
  const map = new Map(citations.map((c) => [c.index, c]))
  const ctx = { threadId: options.threadId, messageId: options.messageId, citations: map }
  if (options.markdown) {
    return { nodes: renderBlocks(source, ctx), chunkIds }
  }
  // Plain rendering: only inline citation badges, no markdown formatting.
  return { nodes: renderPlainInline(source, { ...ctx, keyPrefix: 'plain' }), chunkIds }
}

const PLAIN_PATTERN = `${CITE_OPEN}(\\d+)${CITE_CLOSE}`

function renderPlainInline(text: string, ctx: RenderContext): ReactNode[] {
  const re = new RegExp(PLAIN_PATTERN, 'g')
  const out: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null = re.exec(text)
  let key = 0
  while (match !== null) {
    if (match.index > last) {
      out.push(
        <Fragment key={`${ctx.keyPrefix}-t-${key++}`}>{text.slice(last, match.index)}</Fragment>,
      )
    }
    const index = Number(match[1])
    const spec = ctx.citations.get(index)
    if (spec !== undefined) {
      out.push(
        <CitationBadge
          key={`${ctx.keyPrefix}-c-${key++}`}
          chunkId={spec.chunkId}
          index={spec.index}
          threadId={ctx.threadId}
          messageId={ctx.messageId}
        />,
      )
    }
    last = match.index + match[0].length
    match = re.exec(text)
  }
  if (last < text.length) {
    out.push(<Fragment key={`${ctx.keyPrefix}-t-${key++}`}>{text.slice(last)}</Fragment>)
  }
  return out
}
