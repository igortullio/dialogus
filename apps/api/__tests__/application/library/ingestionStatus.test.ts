import type { IngestionStageProgress } from '@dialogus/shared/schemas/ingestion'
import { describe, expect, it } from 'vitest'
import {
  computeOverallProgress,
  deriveErrorStage,
  deriveQueued,
  deriveStageBreakdown,
  deriveStageIndex,
  deriveStalled,
  estimateEta,
  parseIngestionErrorField,
} from '../../../src/application/library/ingestionStatus'

function stageRecord(
  overrides: Partial<IngestionStageProgress> & { stage: IngestionStageProgress['stage'] },
): IngestionStageProgress {
  return {
    state: 'pending',
    units_done: null,
    units_total: null,
    unit: null,
    started_at: null,
    ended_at: null,
    attempt: 1,
    cached: false,
    ...overrides,
  }
}

describe('computeOverallProgress', () => {
  it('returns 0 for discovered and 100 for ready', () => {
    expect(computeOverallProgress('discovered', null, 0)).toBe(0)
    expect(computeOverallProgress('ready', null, 100)).toBe(100)
  })

  it('blends stage index with the current-stage fraction across 7 stages', () => {
    // embed is index 5; at 50% of its stage → (5 + 0.5) / 7 ≈ 78.57 → 79
    expect(computeOverallProgress('embedding', 'embed', 50)).toBe(79)
    // download (index 0) at 0% → 0
    expect(computeOverallProgress('downloading', 'download', 0)).toBe(0)
    // index (index 6) at 100% → (6 + 1)/7 = 100
    expect(computeOverallProgress('indexing', 'index', 100)).toBe(100)
  })

  it('freezes at the failing stage fraction when failed', () => {
    // failed at embed (index 5) having reached 62% of that stage
    expect(computeOverallProgress('failed', 'embed', 62)).toBe(80)
  })
})

describe('deriveStageIndex', () => {
  it('maps the current stage to its 0-based index', () => {
    expect(deriveStageIndex('download', 'downloading')).toBe(0)
    expect(deriveStageIndex('embed', 'embedding')).toBe(5)
  })

  it('uses the last stage for ready and 0 for discovered', () => {
    expect(deriveStageIndex(null, 'ready')).toBe(6)
    expect(deriveStageIndex(null, 'discovered')).toBe(0)
  })
})

describe('deriveErrorStage', () => {
  it('returns the failing stage only when failed', () => {
    expect(deriveErrorStage('failed', 'embed')).toBe('embed')
    expect(deriveErrorStage('embedding', 'embed')).toBeNull()
    expect(deriveErrorStage('failed', 'not-a-stage')).toBeNull()
  })
})

describe('deriveStalled', () => {
  const now = Date.parse('2026-06-23T12:00:00.000Z')

  it('is true when non-terminal and untouched beyond the threshold', () => {
    const updatedAt = new Date(now - 90_000)
    expect(deriveStalled('downloading', updatedAt, 60_000, now)).toBe(true)
  })

  it('is false within the threshold or for terminal states', () => {
    const recent = new Date(now - 5_000)
    expect(deriveStalled('downloading', recent, 60_000, now)).toBe(false)
    expect(deriveStalled('ready', new Date(now - 999_999), 60_000, now)).toBe(false)
    expect(deriveStalled('failed', new Date(now - 999_999), 60_000, now)).toBe(false)
  })
})

describe('estimateEta', () => {
  const now = Date.parse('2026-06-23T12:00:00.000Z')

  it('extrapolates the current running stage from units + elapsed', () => {
    const stages = [
      stageRecord({
        stage: 'embed',
        state: 'running',
        units_done: 25,
        units_total: 100,
        unit: 'chunks',
        started_at: new Date(now - 10_000).toISOString(),
      }),
    ]
    // 25% done in 10s → ~30s remaining
    expect(estimateEta(stages, 'embed', now)).toBe(30_000)
  })

  it('returns null when not estimable (no units, not running, or complete)', () => {
    expect(
      estimateEta([stageRecord({ stage: 'embed', state: 'pending' })], 'embed', now),
    ).toBeNull()
    expect(estimateEta([], 'embed', now)).toBeNull()
    expect(estimateEta([], null, now)).toBeNull()
  })
})

describe('deriveStageBreakdown', () => {
  it('returns the persisted records normalized to canonical order', () => {
    const persisted = [
      stageRecord({ stage: 'download', state: 'done' }),
      stageRecord({ stage: 'clean', state: 'skipped', cached: true }),
    ]
    const result = deriveStageBreakdown(persisted, 'parsing', 'parse')
    expect(result).toHaveLength(7)
    expect(result.map((r) => r.stage)).toEqual([
      'download',
      'clean',
      'parse',
      'chunk',
      'summarize',
      'embed',
      'index',
    ])
    expect(result[0]?.state).toBe('done')
    expect(result[1]?.cached).toBe(true)
  })

  it('reconstructs from status when no records persisted (legacy rows)', () => {
    const result = deriveStageBreakdown([], 'embedding', 'embed')
    expect(result.find((r) => r.stage === 'download')?.state).toBe('done')
    expect(result.find((r) => r.stage === 'embed')?.state).toBe('running')
    expect(result.find((r) => r.stage === 'index')?.state).toBe('pending')
  })

  it('reconstructs a failed legacy row with the failing stage failed', () => {
    const result = deriveStageBreakdown(null, 'failed', 'parse')
    expect(result.find((r) => r.stage === 'download')?.state).toBe('done')
    expect(result.find((r) => r.stage === 'parse')?.state).toBe('failed')
    expect(result.find((r) => r.stage === 'chunk')?.state).toBe('pending')
  })
})

describe('deriveQueued', () => {
  it('is true only when the current stage record is queued', () => {
    const stages = [stageRecord({ stage: 'clean', state: 'queued' })]
    expect(deriveQueued(stages, 'clean')).toBe(true)
    expect(deriveQueued(stages, 'download')).toBe(false)
    expect(deriveQueued(stages, null)).toBe(false)
  })
})

describe('parseIngestionErrorField', () => {
  it('splits the slug and message and flags retryability', () => {
    const parsed = parseIngestionErrorField('ingestion-embed-failed: boom after 3 attempt(s)')
    expect(parsed).toEqual({
      slug: 'ingestion-embed-failed',
      message: 'boom after 3 attempt(s)',
      retryable: true,
    })
  })

  it('treats a non-retryable slug as such and tolerates malformed input', () => {
    expect(parseIngestionErrorField('ingestion-parse-failed: bad epub')?.retryable).toBe(false)
    expect(parseIngestionErrorField('no-colon-here')).toEqual({
      slug: 'ingestion-failed',
      message: 'no-colon-here',
      retryable: false,
    })
    expect(parseIngestionErrorField(null)).toBeNull()
  })
})
