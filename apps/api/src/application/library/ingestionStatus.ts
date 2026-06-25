import {
  INGESTION_STAGE_ORDER,
  INGESTION_STAGE_VALUES,
  type IngestionStage,
  type IngestionStageProgress,
  type IngestionStatus,
  TOTAL_INGESTION_STAGES,
} from '@dialogus/shared/schemas/ingestion'

const STATUS_TO_STAGE: Record<IngestionStatus, IngestionStage | null> = {
  discovered: null,
  downloading: 'download',
  cleaning: 'clean',
  parsing: 'parse',
  chunking: 'chunk',
  summarizing: 'summarize',
  embedding: 'embed',
  indexing: 'index',
  ready: null,
  failed: null,
}

const RETRYABLE_SLUGS: ReadonlySet<string> = new Set([
  'ingestion-download-failed',
  'ingestion-embed-failed',
  'ingestion-summarize-failed',
])

export function statusToActiveStage(status: IngestionStatus): IngestionStage | null {
  return STATUS_TO_STAGE[status]
}

export function isIngestionStage(value: string): value is IngestionStage {
  return (INGESTION_STAGE_VALUES as readonly string[]).includes(value)
}

export interface ParsedIngestionError {
  readonly slug: string
  readonly message: string
  readonly retryable: boolean
}

export function parseIngestionErrorField(raw: string | null): ParsedIngestionError | null {
  if (raw === null) return null
  const idx = raw.indexOf(': ')
  if (idx <= 0) {
    return { slug: 'ingestion-failed', message: raw, retryable: false }
  }
  const slug = raw.slice(0, idx)
  const message = raw.slice(idx + 2)
  return { slug, message, retryable: RETRYABLE_SLUGS.has(slug) }
}

// ---------------------------------------------------------------------------
// Enriched-status derivations (feature 002). All pure + `now`-injectable so the
// unit tests are deterministic.
// ---------------------------------------------------------------------------

/** Failing stage for a failed run (from the persisted last stage), else null. */
export function deriveErrorStage(
  status: IngestionStatus,
  lastStage: string | null,
): IngestionStage | null {
  if (status !== 'failed') return null
  return lastStage !== null && isIngestionStage(lastStage) ? lastStage : null
}

/** Progress across the whole 7-stage pipeline (0–100). */
export function computeOverallProgress(
  status: IngestionStatus,
  stage: IngestionStage | null,
  currentStageProgress: number,
): number {
  if (status === 'ready') return 100
  if (status === 'discovered' || stage === null) return 0
  const stageIndex = INGESTION_STAGE_ORDER.indexOf(stage)
  if (stageIndex < 0) return 0
  const fraction = Math.max(0, Math.min(100, currentStageProgress)) / 100
  return Math.round(((stageIndex + fraction) / TOTAL_INGESTION_STAGES) * 100)
}

/** 0-based index for "etapa N de 7"; ready ⇒ last stage, discovered ⇒ 0. */
export function deriveStageIndex(stage: IngestionStage | null, status: IngestionStatus): number {
  if (stage !== null) {
    const idx = INGESTION_STAGE_ORDER.indexOf(stage)
    return idx < 0 ? 0 : idx
  }
  return status === 'ready' ? TOTAL_INGESTION_STAGES - 1 : 0
}

function blankStage(stage: IngestionStage): IngestionStageProgress {
  return {
    stage,
    state: 'pending',
    units_done: null,
    units_total: null,
    unit: null,
    started_at: null,
    ended_at: null,
    attempt: 1,
    cached: false,
  }
}

/**
 * Reconstruct an ordered breakdown from status alone, for rows ingested before
 * this feature (empty `ingestion_stages`). Graceful degradation (FR-013).
 */
function reconstructStages(
  status: IngestionStatus,
  stage: IngestionStage | null,
): IngestionStageProgress[] {
  const currentIndex = stage !== null ? INGESTION_STAGE_ORDER.indexOf(stage) : -1
  return INGESTION_STAGE_ORDER.map((s, index) => {
    const record = blankStage(s)
    if (status === 'ready') return { ...record, state: 'done' }
    if (status === 'failed') {
      if (index < currentIndex) return { ...record, state: 'done' }
      if (index === currentIndex) return { ...record, state: 'failed' }
      return record
    }
    if (index < currentIndex) return { ...record, state: 'done' }
    if (index === currentIndex) return { ...record, state: 'running' }
    return record
  })
}

/** Ordered, length-7 breakdown from persisted records, falling back to status. */
export function deriveStageBreakdown(
  persisted: readonly IngestionStageProgress[] | null | undefined,
  status: IngestionStatus,
  stage: IngestionStage | null,
): IngestionStageProgress[] {
  if (persisted && persisted.length > 0) {
    const byStage = new Map(persisted.map((record) => [record.stage, record]))
    return INGESTION_STAGE_ORDER.map((s) => byStage.get(s) ?? blankStage(s))
  }
  return reconstructStages(status, stage)
}

/** True when the current stage record exists and is queued (worker not started). */
export function deriveQueued(
  stages: readonly IngestionStageProgress[],
  stage: IngestionStage | null,
): boolean {
  if (stage === null) return false
  return stages.find((record) => record.stage === stage)?.state === 'queued'
}

/** Non-terminal and untouched past the stall window ⇒ suspected wedge (FR-016). */
export function deriveStalled(
  status: IngestionStatus,
  updatedAt: Date | null | undefined,
  thresholdMs: number,
  now: number,
): boolean {
  if (status === 'ready' || status === 'failed' || status === 'discovered') return false
  if (updatedAt == null) return false
  return now - updatedAt.getTime() > thresholdMs
}

/** Best-effort remaining estimate for the current stage; null when not estimable. */
export function estimateEta(
  stages: readonly IngestionStageProgress[],
  stage: IngestionStage | null,
  now: number,
): number | null {
  if (stage === null) return null
  const record = stages.find((r) => r.stage === stage)
  if (!record || record.state !== 'running' || record.started_at === null) return null
  const { units_done: done, units_total: total } = record
  if (done === null || total === null || total <= 0 || done <= 0 || done >= total) return null
  const elapsed = now - new Date(record.started_at).getTime()
  if (elapsed <= 0) return null
  const fraction = done / total
  return Math.max(0, Math.round((elapsed / fraction) * (1 - fraction)))
}
