'use client'

import type { IngestionStageProgress, IngestionStatusDto } from '@dialogus/shared/schemas/ingestion'
import { AlertTriangle, Check, Clock, FastForward, Loader2 } from 'lucide-react'
import { stageDisplayName, stageStateLabel, unitLabel } from '@/lib/ingestion/messages'
import { cn } from '@/lib/utils'

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes}min` : `${minutes}min ${seconds}s`
}

function subProgressText(record: IngestionStageProgress): string | null {
  if (record.unit === null || record.units_done === null) return null
  if (record.unit === 'bytes') return null // bytes are noisy; the bar conveys it
  const total = record.units_total
  const noun = unitLabel(record.unit, total ?? record.units_done)
  return total !== null ? `${record.units_done}/${total} ${noun}` : `${record.units_done} ${noun}`
}

interface StageIconProps {
  readonly state: IngestionStageProgress['state']
}

function StageIcon({ state }: StageIconProps) {
  if (state === 'done') {
    return (
      <Check aria-hidden className="h-3.5 w-3.5 text-status-ready" data-slot="stage-icon-done" />
    )
  }
  if (state === 'skipped') {
    return (
      <FastForward
        aria-hidden
        className="h-3.5 w-3.5 text-muted-foreground"
        data-slot="stage-icon-skipped"
      />
    )
  }
  if (state === 'running') {
    return (
      <Loader2
        aria-hidden
        className="h-3.5 w-3.5 animate-spin text-status-progress"
        data-slot="stage-icon-running"
      />
    )
  }
  if (state === 'failed') {
    return (
      <AlertTriangle
        aria-hidden
        className="h-3.5 w-3.5 text-status-failed"
        data-slot="stage-icon-failed"
      />
    )
  }
  if (state === 'queued') {
    return (
      <Clock
        aria-hidden
        className="h-3.5 w-3.5 text-muted-foreground"
        data-slot="stage-icon-queued"
      />
    )
  }
  return (
    <span
      aria-hidden
      data-slot="stage-icon-pending"
      className="inline-block h-3.5 w-3.5 rounded-full border border-muted-foreground/40"
    />
  )
}

interface StageRowProps {
  readonly record: IngestionStageProgress
  readonly current: boolean
}

function StageRow({ record, current }: StageRowProps) {
  const sub = subProgressText(record)
  const cached = record.cached
  return (
    <li
      data-slot="stage-row"
      data-stage={record.stage}
      data-state={record.state}
      aria-current={current ? 'step' : undefined}
      className={cn(
        'flex items-center gap-2 text-xs',
        record.state === 'pending' ? 'text-muted-foreground' : 'text-foreground',
        current && 'font-medium',
      )}
    >
      <StageIcon state={record.state} />
      <span className="flex-1 truncate">{stageDisplayName(record.stage)}</span>
      {sub && (
        <span
          data-slot="stage-subprogress"
          className="font-mono text-[11px] text-muted-foreground tabular-nums"
        >
          {sub}
        </span>
      )}
      <span data-slot="stage-state" className="sr-only">
        {cached ? 'Cacheado' : stageStateLabel(record.state)}
      </span>
      {cached && (
        <span
          data-slot="stage-cached-badge"
          className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide"
        >
          cache
        </span>
      )}
    </li>
  )
}

export interface StageStepperProps {
  readonly status: IngestionStatusDto
  readonly className?: string
}

export function StageStepper({ status, className }: StageStepperProps) {
  const {
    stages,
    stage_index,
    total_stages,
    overall_progress,
    elapsed_ms,
    eta_ms,
    queued,
    stalled,
  } = status

  return (
    <div
      data-slot="stage-stepper"
      data-overall={overall_progress}
      className={cn('flex flex-col gap-2', className)}
    >
      <div className="flex items-center justify-between text-xs">
        <span data-slot="stage-stepper-position" className="font-medium">
          Etapa {Math.min(stage_index + 1, total_stages)} de {total_stages}
        </span>
        <span
          data-slot="stage-stepper-overall"
          className="font-mono tabular-nums text-muted-foreground"
        >
          {overall_progress}%
        </span>
      </div>

      <div
        data-slot="stage-stepper-overall-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={overall_progress}
        aria-label="Progresso total da ingestão"
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full bg-status-progress transition-all"
          style={{ width: `${overall_progress}%` }}
        />
      </div>

      {(queued || stalled || elapsed_ms !== null) && (
        <div
          data-slot="stage-stepper-meta"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
        >
          {queued && <span data-slot="stage-stepper-queued">Na fila — aguardando worker</span>}
          {stalled && (
            <span data-slot="stage-stepper-stalled" className="text-status-failed">
              Sem progresso há um tempo
            </span>
          )}
          {elapsed_ms !== null && (
            <span data-slot="stage-stepper-elapsed">decorrido {formatDuration(elapsed_ms)}</span>
          )}
          {eta_ms !== null && (
            <span data-slot="stage-stepper-eta">~{formatDuration(eta_ms)} restantes</span>
          )}
        </div>
      )}

      <ol data-slot="stage-stepper-list" className="flex flex-col gap-1.5">
        {stages.map((record, index) => (
          <StageRow key={record.stage} record={record} current={index === stage_index} />
        ))}
      </ol>
    </div>
  )
}

export const _internals = { formatDuration, subProgressText }
