'use client'

import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { bookQueryKey } from '@/components/citation/CitationTooltip'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Book } from '@/lib/api/_schemas'
import { fetchBookById } from '@/lib/api/library'
import { useSpoilerCap } from '@/lib/spoiler-cap'
import { cn } from '@/lib/utils'
import { useDialogusThreadContext } from './DialogusContext'

const TITLE_MAX_LEN = 24
const CHIP_TOOLTIP_LABEL = 'Trocar livros = nova conversa'
const SLIDER_DEBOUNCE_MS = 200
const FALLBACK_CHAPTER_MAX = 100
const NO_CAP_LABEL = 'Sem cap'

const LANGUAGE_FLAGS: Readonly<Record<string, string>> = {
  pt: '🇧🇷',
  en: '🇬🇧',
  fr: '🇫🇷',
  de: '🇩🇪',
  es: '🇪🇸',
  it: '🇮🇹',
}

function languageFlag(languages: readonly string[]): string {
  const code = languages[0]?.toLowerCase() ?? ''
  return LANGUAGE_FLAGS[code] ?? '📖'
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}

export interface ThreadHeaderProps {
  readonly className?: string
}

export function ThreadHeader({ className }: ThreadHeaderProps) {
  const { threadId, bookIds } = useDialogusThreadContext()

  if (threadId === null || bookIds.length === 0) return null

  return (
    <TooltipProvider delayDuration={300}>
      <div
        data-slot="thread-header"
        className={cn(
          'flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2',
          className,
        )}
      >
        {bookIds.map((bookId) => (
          <BookChip key={bookId} threadId={threadId} bookId={bookId} />
        ))}
      </div>
    </TooltipProvider>
  )
}

interface BookChipProps {
  readonly threadId: string
  readonly bookId: string
}

function BookChip({ threadId, bookId }: BookChipProps) {
  const [open, setOpen] = useState(false)
  const book = useQuery<Book>({
    queryKey: bookQueryKey(bookId),
    queryFn: () => fetchBookById(bookId),
  })
  const { cap, setCap, isLoaded } = useSpoilerCap(threadId, bookId)

  if (book.isPending || !book.data) {
    return (
      <div
        data-slot="thread-header-chip-loading"
        data-book-id={bookId}
        className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1"
      >
        <Skeleton className="h-3 w-24" />
      </div>
    )
  }

  const flag = languageFlag(book.data.languages)
  const fullTitle = book.data.title
  const truncatedTitle = truncate(fullTitle, TITLE_MAX_LEN)
  const chapterCount = book.data.chapter_count

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-slot="thread-header-chip"
              data-book-id={bookId}
              data-cap={cap ?? ''}
              aria-label={`Configurar cap de spoiler para ${fullTitle}`}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm',
                'transition-colors hover:bg-accent focus-visible:outline-none',
                'focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <span aria-hidden className="text-base leading-none">
                {flag}
              </span>
              <span className="font-medium">{truncatedTitle}</span>
              {cap !== null && (
                <Badge
                  data-slot="thread-header-cap-badge"
                  variant="secondary"
                  className="h-5 px-1.5 py-0 font-normal text-[0.7rem] leading-none"
                >
                  {`Cap. ≤ ${cap}`}
                </Badge>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent role="tooltip" side="bottom" sideOffset={4}>
          {CHIP_TOOLTIP_LABEL}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        data-slot="thread-header-popover"
        className="w-80 space-y-3 p-4"
      >
        <CapPopoverBody
          fullTitle={fullTitle}
          chapterCount={chapterCount}
          cap={cap}
          isLoaded={isLoaded}
          setCap={setCap}
        />
      </PopoverContent>
    </Popover>
  )
}

interface CapPopoverBodyProps {
  readonly fullTitle: string
  readonly chapterCount: number | undefined
  readonly cap: number | null
  readonly isLoaded: boolean
  setCap(value: number | null): void
}

function CapPopoverBody({ fullTitle, chapterCount, cap, isLoaded, setCap }: CapPopoverBodyProps) {
  const max = chapterCount ?? FALLBACK_CHAPTER_MAX
  const sliderValue = cap ?? max
  const [pendingValue, setPendingValue] = useState<number>(sliderValue)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isLoaded) setPendingValue(cap ?? max)
  }, [isLoaded, cap, max])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  const cancelPending = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const handleSliderChange = useCallback(
    (value: number) => {
      setPendingValue(value)
      cancelPending()
      timerRef.current = setTimeout(() => {
        setCap(value)
        timerRef.current = null
      }, SLIDER_DEBOUNCE_MS)
    },
    [cancelPending, setCap],
  )

  const handleToggleNoCap = useCallback(
    (noCapEnabled: boolean) => {
      cancelPending()
      if (noCapEnabled) {
        setCap(null)
        setPendingValue(max)
      } else {
        const initial = max
        setPendingValue(initial)
        setCap(initial)
      }
    },
    [cancelPending, setCap, max],
  )

  const noCap = cap === null
  const sliderDisabled = noCap || chapterCount === undefined

  return (
    <div className="flex flex-col gap-3" data-slot="thread-header-popover-body">
      <h3 className="font-serif text-sm leading-tight">{fullTitle}</h3>
      <div className="flex items-center justify-between text-sm">
        <span>{NO_CAP_LABEL}</span>
        <Switch
          data-slot="thread-header-no-cap-switch"
          checked={noCap}
          onCheckedChange={handleToggleNoCap}
          aria-label={NO_CAP_LABEL}
        />
      </div>
      {chapterCount !== undefined ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Capítulo máximo</span>
            <span data-slot="thread-header-cap-readout" className="font-medium tabular-nums">
              {pendingValue}
            </span>
          </div>
          <Slider
            data-slot="thread-header-slider"
            min={1}
            max={chapterCount}
            step={1}
            value={[pendingValue]}
            disabled={sliderDisabled}
            onValueChange={(values) => {
              const next = values[0]
              if (typeof next === 'number') handleSliderChange(next)
            }}
            aria-label="Capítulo máximo do cap de spoiler"
          />
        </div>
      ) : (
        <p data-slot="thread-header-no-chapters" className="text-muted-foreground text-xs">
          Capítulos disponíveis em breve.
        </p>
      )}
    </div>
  )
}

export const _internals = {
  CHIP_TOOLTIP_LABEL,
  TITLE_MAX_LEN,
  SLIDER_DEBOUNCE_MS,
  FALLBACK_CHAPTER_MAX,
  NO_CAP_LABEL,
  languageFlag,
  truncate,
}
