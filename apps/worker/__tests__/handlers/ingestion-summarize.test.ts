import type { Job } from '@dialogus/db/pgboss'
import type { ChapterSummaryGenerator, ChapterSummaryRepository } from '@dialogus/ingestion'
import type { StagePayload } from '@dialogus/ingestion/application/stages/_common'
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { createSummarizeHandler, SUMMARIZE_QUEUE } from '../../src/handlers/ingestion-summarize'

const summarizeStageMock = vi.hoisted(() =>
  vi.fn(async () => {
    /* spy */
  }),
)

vi.mock('@dialogus/ingestion/application/stages/summarize', () => ({
  summarizeStage: summarizeStageMock,
}))

describe('apps/worker ingestion-summarize handler', () => {
  it('exposes the canonical queue name for ADR-008', () => {
    expect(SUMMARIZE_QUEUE).toBe('ingestion.summarize')
  })

  it('invokes summarizeStage once per job with the configured deps', async () => {
    summarizeStageMock.mockClear()
    const logger = pino({ level: 'silent' })
    const stubDb = {} as unknown as Parameters<typeof createSummarizeHandler>[0]['deps']['db']
    const stubBoss = {} as unknown as Parameters<typeof createSummarizeHandler>[0]['deps']['pgboss']
    const stubChapterRepo = {} as unknown as Parameters<
      typeof createSummarizeHandler
    >[0]['deps']['chapterRepo']
    const stubSummaryRepo: ChapterSummaryRepository = {
      save: vi.fn(),
      findByChapterId: vi.fn(),
      listMissingChapterIds: vi.fn(),
    }
    const stubGenerator: ChapterSummaryGenerator = { generate: vi.fn() }

    const handler = createSummarizeHandler({
      logger,
      deps: {
        db: stubDb,
        pgboss: stubBoss,
        chapterRepo: stubChapterRepo,
        chapterSummaryRepo: stubSummaryRepo,
        chapterSummaryGenerator: stubGenerator,
      },
    })

    const jobs: Job<StagePayload>[] = [
      { id: 'j1', name: 'ingestion.summarize', data: { bookId: 'book-1' } } as Job<StagePayload>,
      { id: 'j2', name: 'ingestion.summarize', data: { bookId: 'book-2' } } as Job<StagePayload>,
    ]

    await handler(jobs)

    expect(summarizeStageMock).toHaveBeenCalledTimes(2)
    expect(summarizeStageMock).toHaveBeenNthCalledWith(
      1,
      { bookId: 'book-1' },
      expect.objectContaining({
        db: stubDb,
        pgboss: stubBoss,
        chapterRepo: stubChapterRepo,
        chapterSummaryRepo: stubSummaryRepo,
        chapterSummaryGenerator: stubGenerator,
      }),
    )
    expect(summarizeStageMock).toHaveBeenNthCalledWith(
      2,
      { bookId: 'book-2' },
      expect.objectContaining({ chapterSummaryGenerator: stubGenerator }),
    )

    const passedDeps = summarizeStageMock.mock.calls[0]?.[1] as {
      logger?: { bindings?: () => Record<string, unknown> }
    }
    expect(typeof passedDeps?.logger?.bindings).toBe('function')
    expect(passedDeps?.logger?.bindings?.()).toMatchObject({ stage: 'summarize' })
  })
})
