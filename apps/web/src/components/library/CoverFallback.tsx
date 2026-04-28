'use client'

import { cn } from '@/lib/utils'

const COVER_PALETTE = [
  { background: '#3a3a52', foreground: '#f5f1e8' },
  { background: '#4a3a3a', foreground: '#f5f1e8' },
  { background: '#3a4a3e', foreground: '#f5f1e8' },
  { background: '#3a4a52', foreground: '#f5f1e8' },
  { background: '#52423a', foreground: '#f5f1e8' },
  { background: '#42385a', foreground: '#f5f1e8' },
  { background: '#5a4a3a', foreground: '#f5f1e8' },
  { background: '#2f4a4a', foreground: '#f5f1e8' },
] as const

const PALETTE_SIZE = COVER_PALETTE.length
const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193
const ASPECT_WIDTH = 200
const ASPECT_HEIGHT = 300
const TITLE_MAX_CHARS = 60
const AUTHOR_MAX_CHARS = 36

function fnv1a(input: string): number {
  let hash = FNV_OFFSET_BASIS
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return hash >>> 0
}

function paletteIndex(title: string): number {
  return fnv1a(title) % PALETTE_SIZE
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars - 1).trimEnd()}…`
}

function wrapTitle(title: string): string[] {
  const truncated = truncate(title, TITLE_MAX_CHARS)
  const words = truncated.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  const lineMax = 18
  for (const word of words) {
    if (current.length === 0) {
      current = word
      continue
    }
    if (current.length + 1 + word.length > lineMax) {
      lines.push(current)
      current = word
      continue
    }
    current = `${current} ${word}`
  }
  if (current.length > 0) lines.push(current)
  return lines.slice(0, 4)
}

export interface CoverFallbackProps {
  readonly title: string
  readonly author?: string
  readonly className?: string
}

export function CoverFallback({ title, author, className }: CoverFallbackProps) {
  const safeTitle = title.length === 0 ? 'Sem título' : title
  const colorIndex = paletteIndex(safeTitle)
  const color = COVER_PALETTE[colorIndex] ?? COVER_PALETTE[0]
  const titleLines = wrapTitle(safeTitle)
  const authorLine = author && author.length > 0 ? truncate(author, AUTHOR_MAX_CHARS) : null
  const ariaLabel = `Capa de '${safeTitle}'`

  const titleStartY = 110
  const lineHeight = 24
  const positionedLines = titleLines.map((line, idx) => ({
    key: `line-${idx}-${line}`,
    text: line,
    y: titleStartY + idx * lineHeight,
  }))

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${ASPECT_WIDTH} ${ASPECT_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      data-slot="cover-fallback"
      data-palette-index={colorIndex}
      className={cn('aspect-[2/3] w-full rounded-md border', className)}
    >
      <rect
        x="0"
        y="0"
        width={ASPECT_WIDTH}
        height={ASPECT_HEIGHT}
        fill={color.background}
        data-slot="cover-fallback-bg"
      />
      <g
        fill={color.foreground}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        textAnchor="middle"
        data-slot="cover-fallback-text"
      >
        {positionedLines.map((line) => (
          <text key={line.key} x={ASPECT_WIDTH / 2} y={line.y} fontSize="20" fontWeight="600">
            {line.text}
          </text>
        ))}
        {authorLine && (
          <text
            x={ASPECT_WIDTH / 2}
            y={ASPECT_HEIGHT - 30}
            fontSize="13"
            fillOpacity="0.85"
            data-slot="cover-fallback-author"
          >
            {authorLine}
          </text>
        )}
      </g>
    </svg>
  )
}

export const _internals = {
  COVER_PALETTE,
  PALETTE_SIZE,
  ASPECT_WIDTH,
  ASPECT_HEIGHT,
  fnv1a,
  paletteIndex,
  truncate,
  wrapTitle,
}
