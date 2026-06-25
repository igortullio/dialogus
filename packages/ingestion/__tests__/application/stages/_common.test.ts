import type { Database } from '@dialogus/db/client'
import type { IngestionStageProgress } from '@dialogus/db/schema'
import { describe, expect, it } from 'vitest'
import {
  beginStage,
  completeStage,
  failStage,
  queueStage,
  reportStageUnits,
  resetStagesFrom,
  skipStageCached,
} from '../../../src/application/stages/_common'

interface FakeState {
  ingestionStages: IngestionStageProgress[]
  ingestionStatus?: string
  ingestionError?: string | null
  ingestionProgress?: number
  ingestionLastStage?: string | null
}

/** Minimal in-memory stand-in for the Drizzle client used by the stage helpers. */
function makeFakeDb(initial: IngestionStageProgress[] = []): {
  db: Database
  state: FakeState
} {
  const state: FakeState = { ingestionStages: initial }
  const db = {
    query: {
      books: {
        findFirst: async () => ({ ingestionStages: state.ingestionStages }),
      },
    },
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => {
          const target = state as unknown as Record<string, unknown>
          for (const [key, value] of Object.entries(set)) {
            if (key === 'updatedAt') continue
            target[key] = value
          }
        },
      }),
    }),
  }
  return { db: db as unknown as Database, state }
}

const BOOK_ID = 'book-1'

function find(state: FakeState, stage: IngestionStageProgress['stage']) {
  return state.ingestionStages.find((r) => r.stage === stage)
}

describe('stage-record helpers', () => {
  it('beginStage marks the stage running and normalizes the full 7-stage array', async () => {
    const { db, state } = makeFakeDb()
    await beginStage(db, BOOK_ID, 'download', { unit: 'bytes', markStartedAtIfNull: true })
    expect(state.ingestionStages).toHaveLength(7)
    expect(state.ingestionStatus).toBe('downloading')
    expect(state.ingestionProgress).toBe(0)
    const download = find(state, 'download')
    expect(download?.state).toBe('running')
    expect(download?.started_at).not.toBeNull()
    expect(find(state, 'index')?.state).toBe('pending')
  })

  it('reportStageUnits updates units + percent of the running stage', async () => {
    const { db, state } = makeFakeDb()
    await beginStage(db, BOOK_ID, 'summarize', { unit: 'chapters', unitsTotal: 80 })
    await reportStageUnits(db, BOOK_ID, 'summarize', 20, { unitsTotal: 80, unit: 'chapters' })
    const summarize = find(state, 'summarize')
    expect(summarize?.units_done).toBe(20)
    expect(summarize?.units_total).toBe(80)
    expect(state.ingestionProgress).toBe(25)
  })

  it('completeStage marks done and fills units_done from total', async () => {
    const { db, state } = makeFakeDb()
    await beginStage(db, BOOK_ID, 'summarize', { unit: 'chapters', unitsTotal: 80 })
    await completeStage(db, BOOK_ID, 'summarize')
    const summarize = find(state, 'summarize')
    expect(summarize?.state).toBe('done')
    expect(summarize?.ended_at).not.toBeNull()
    expect(summarize?.units_done).toBe(80)
    expect(state.ingestionProgress).toBe(100)
  })

  it('completeStage on index can flip the final status to ready', async () => {
    const { db, state } = makeFakeDb()
    await beginStage(db, BOOK_ID, 'index')
    await completeStage(db, BOOK_ID, 'index', { finalStatus: 'ready', indexedAt: new Date() })
    expect(state.ingestionStatus).toBe('ready')
    expect(find(state, 'index')?.state).toBe('done')
  })

  it('skipStageCached marks the stage skipped + cached', async () => {
    const { db, state } = makeFakeDb()
    await beginStage(db, BOOK_ID, 'clean')
    await skipStageCached(db, BOOK_ID, 'clean')
    const clean = find(state, 'clean')
    expect(clean?.state).toBe('skipped')
    expect(clean?.cached).toBe(true)
  })

  it('failStage marks the stage failed and writes the snapshot error', async () => {
    const { db, state } = makeFakeDb()
    await beginStage(db, BOOK_ID, 'embed', { unit: 'chunks' })
    await failStage(db, BOOK_ID, 'embed', 'ingestion-embed-failed: boom')
    expect(state.ingestionStatus).toBe('failed')
    expect(state.ingestionError).toBe('ingestion-embed-failed: boom')
    expect(find(state, 'embed')?.state).toBe('failed')
  })

  it('queueStage marks the next stage queued', async () => {
    const { db, state } = makeFakeDb()
    await beginStage(db, BOOK_ID, 'download')
    await queueStage(db, BOOK_ID, 'clean')
    expect(find(state, 'clean')?.state).toBe('queued')
  })

  it('beginStage bumps the attempt counter on a re-entry of a still-running stage', async () => {
    const { db, state } = makeFakeDb()
    await beginStage(db, BOOK_ID, 'download')
    await beginStage(db, BOOK_ID, 'download') // pg-boss retry
    expect(find(state, 'download')?.attempt).toBe(2)
  })
})

describe('resetStagesFrom', () => {
  it('resets the resumed stage and everything after it, preserving earlier records', () => {
    const stages: IngestionStageProgress[] = [
      {
        stage: 'download',
        state: 'done',
        units_done: 1,
        units_total: 1,
        unit: 'bytes',
        started_at: 'x',
        ended_at: 'y',
        attempt: 1,
        cached: false,
      },
      {
        stage: 'clean',
        state: 'skipped',
        units_done: null,
        units_total: null,
        unit: null,
        started_at: 'x',
        ended_at: 'y',
        attempt: 1,
        cached: true,
      },
      {
        stage: 'parse',
        state: 'done',
        units_done: null,
        units_total: null,
        unit: null,
        started_at: 'x',
        ended_at: 'y',
        attempt: 1,
        cached: false,
      },
      {
        stage: 'chunk',
        state: 'done',
        units_done: null,
        units_total: null,
        unit: null,
        started_at: 'x',
        ended_at: 'y',
        attempt: 1,
        cached: false,
      },
      {
        stage: 'summarize',
        state: 'failed',
        units_done: 3,
        units_total: 10,
        unit: 'chapters',
        started_at: 'x',
        ended_at: 'y',
        attempt: 1,
        cached: false,
      },
      {
        stage: 'embed',
        state: 'pending',
        units_done: null,
        units_total: null,
        unit: null,
        started_at: null,
        ended_at: null,
        attempt: 1,
        cached: false,
      },
      {
        stage: 'index',
        state: 'pending',
        units_done: null,
        units_total: null,
        unit: null,
        started_at: null,
        ended_at: null,
        attempt: 1,
        cached: false,
      },
    ]
    const reset = resetStagesFrom(stages, 'summarize')
    expect(reset.find((r) => r.stage === 'download')?.state).toBe('done')
    expect(reset.find((r) => r.stage === 'clean')?.cached).toBe(true)
    expect(reset.find((r) => r.stage === 'parse')?.state).toBe('done')
    expect(reset.find((r) => r.stage === 'summarize')?.state).toBe('pending')
    expect(reset.find((r) => r.stage === 'summarize')?.units_done).toBeNull()
  })

  it('normalizes a sparse array to the full ordered set', () => {
    const reset = resetStagesFrom([], 'download')
    expect(reset).toHaveLength(7)
    expect(reset.every((r) => r.state === 'pending')).toBe(true)
  })
})
