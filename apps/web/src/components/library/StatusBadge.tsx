'use client'

import type { IngestionStatus } from '@dialogus/shared/schemas/ingestion'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<IngestionStatus, string> = {
  discovered: 'Aguardando ingestão',
  downloading: 'Baixando',
  cleaning: 'Limpando',
  parsing: 'Parseando',
  chunking: 'Chunking',
  summarizing: 'Sumarizando',
  embedding: 'Embeddings',
  indexing: 'Indexando',
  ready: 'Pronto',
  failed: 'Falhou',
}

const IN_PROGRESS_STATUSES = new Set<IngestionStatus>([
  'downloading',
  'cleaning',
  'parsing',
  'chunking',
  'summarizing',
  'embedding',
  'indexing',
])

export function isInProgress(status: IngestionStatus): boolean {
  return IN_PROGRESS_STATUSES.has(status)
}

type Variant = 'neutral' | 'progress' | 'ready' | 'failed'

function variantFor(status: IngestionStatus): Variant {
  if (status === 'ready') return 'ready'
  if (status === 'failed') return 'failed'
  if (status === 'discovered') return 'neutral'
  return 'progress'
}

const VARIANT_CLASSES: Record<Variant, string> = {
  neutral: 'bg-muted text-muted-foreground border-border',
  progress: 'bg-status-progress text-status-progress-foreground border-transparent',
  ready: 'bg-status-ready text-status-ready-foreground border-transparent',
  failed: 'bg-status-failed text-status-failed-foreground border-transparent',
}

function clampPercent(value: number | undefined): number | null {
  if (value === undefined || Number.isNaN(value)) return null
  return Math.max(0, Math.min(100, Math.round(value)))
}

export interface StatusBadgeProps {
  readonly status: IngestionStatus
  readonly progress?: number
  readonly className?: string
}

export function StatusBadge({ status, progress, className }: StatusBadgeProps) {
  const variant = variantFor(status)
  const percent = isInProgress(status) ? clampPercent(progress) : null
  const label = STATUS_LABEL[status]

  return (
    <span
      data-slot="status-badge"
      data-status={status}
      data-variant={variant}
      role="status"
      aria-label={percent !== null ? `${label} ${percent}%` : label}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {variant === 'progress' && (
        <Loader2 aria-hidden className="h-3 w-3 animate-spin" data-slot="status-badge-spinner" />
      )}
      {variant === 'ready' && (
        <CheckCircle2 aria-hidden className="h-3 w-3" data-slot="status-badge-check" />
      )}
      {variant === 'failed' && (
        <AlertTriangle aria-hidden className="h-3 w-3" data-slot="status-badge-warning" />
      )}
      <span>{label}</span>
      {percent !== null && (
        <span data-slot="status-badge-percent" className="font-mono tabular-nums">
          {percent}%
        </span>
      )}
    </span>
  )
}

export const _internals = {
  STATUS_LABEL,
  IN_PROGRESS_STATUSES,
  variantFor,
  clampPercent,
}
