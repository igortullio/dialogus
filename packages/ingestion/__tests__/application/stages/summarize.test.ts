import type { Database } from '@dialogus/db/client'
import type { PgBoss } from '@dialogus/db/pgboss'
import { INGESTION_STATUS_VALUES, ingestionStatusEnum } from '@dialogus/shared/schemas/ingestion'
import { describe, expect, it, vi } from 'vitest'
import type { BookRecordForStage } from '../../../src/application/stages/_common'
import { type SummarizeStageDeps, summarizeStage } from '../../../src/application/stages/summarize'
import type { Chapter } from '../../../src/domain/chapter/Chapter'
import type { ChapterRepository } from '../../../src/domain/chapter/ChapterRepository.port'
import type { ChapterSummary } from '../../../src/domain/chapter_summary/ChapterSummary'
import type {
  ChapterSummaryGeneration,
  ChapterSummaryGenerator,
} from '../../../src/domain/chapter_summary/ChapterSummaryGenerator.port'
import type { ChapterSummaryRepository } from '../../../src/domain/chapter_summary/ChapterSummaryRepository.port'
import { SummarizeError } from '../../../src/domain/ingestion/IngestionError'
import type {
  ParsedChapter,
  SupportedLanguage,
} from '../../../src/domain/parser/ChapterParser.port'

const BOOK_ID = 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1'
const GUTENDEX_ID = 1234

interface UpdateCall {
  set: Record<string, unknown>
}

function makeMockDb(book: BookRecordForStage | null) {
  const updates: UpdateCall[] = []
  const findFirst = vi.fn(async () => book ?? undefined)
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's update chain shape
  const updateChain: any = {
    set(value: Record<string, unknown>) {
      this._set = value
      return this
    },
    where(_cond: unknown) {
      updates.push({ set: this._set as Record<string, unknown> })
      return Promise.resolve()
    },
  }
  const db = {
    query: { books: { findFirst } },
    update: vi.fn(() => updateChain),
  } as unknown as Database
  return { db, updates }
}

function makeBook(overrides: Partial<BookRecordForStage> = {}): BookRecordForStage {
  return {
    id: BOOK_ID,
    gutendexId: GUTENDEX_ID,
    languages: ['en'],
    ingestionStatus: 'chunking',
    ingestionLastStage: 'chunk',
    ingestionStartedAt: new Date('2026-04-26T10:00:00Z'),
    rawHash: 'some-hash',
    downloadUrlEpub: 'https://example.test/epub',
    downloadUrlTxt: null,
    ...overrides,
  }
}

interface CapturedLog {
  level: 'info' | 'warn' | 'error'
  meta: Record<string, unknown>
  msg: string
}

function makeLogger(): { logger: SummarizeStageDeps['logger']; logs: CapturedLog[] } {
  const logs: CapturedLog[] = []
  const logger: SummarizeStageDeps['logger'] = {
    info(meta, msg) {
      logs.push({ level: 'info', meta, msg })
    },
    warn(meta, msg) {
      logs.push({ level: 'warn', meta, msg })
    },
    error(meta, msg) {
      logs.push({ level: 'error', meta, msg })
    },
  }
  return { logger, logs }
}

function makePgBoss(): PgBoss & { send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(async () => 'job-id-123')
  return { send } as unknown as PgBoss & { send: ReturnType<typeof vi.fn> }
}

function makeChapter(ordinal: number, overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: `${ordinal.toString().padStart(8, '0')}-2222-2222-2222-222222222222`,
    bookId: BOOK_ID,
    ordinal,
    title: `Chapter ${ordinal + 1}`,
    plainText: `Plain text of chapter ${ordinal + 1}`,
    tokenCount: 100 + ordinal,
    createdAt: new Date('2026-04-26T10:00:00Z'),
    ...overrides,
  }
}

interface ChapterRepoMock {
  repo: ChapterRepository
  findById: ReturnType<typeof vi.fn>
  countByBookId: ReturnType<typeof vi.fn>
}

function makeChapterRepo(chapters: readonly Chapter[]): ChapterRepoMock {
  const byId = new Map(chapters.map((c) => [c.id, c]))
  const findById = vi.fn(async (chapterId: string) => byId.get(chapterId) ?? null)
  const countByBookId = vi.fn(async () => chapters.length)
  const repo: ChapterRepository = {
    saveMany: vi.fn(async () => {}),
    listByBookId: vi.fn(async () => [...chapters]),
    streamByBookId: vi.fn(async function* () {
      for (const c of chapters) yield c
    }) as unknown as ChapterRepository['streamByBookId'],
    countByBookId,
    findById,
  }
  return { repo, findById, countByBookId }
}

interface SummaryRepoMock {
  repo: ChapterSummaryRepository
  saved: ChapterSummary[]
  listMissingChapterIds: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
}

function makeSummaryRepo(missing: readonly string[]): SummaryRepoMock {
  const saved: ChapterSummary[] = []
  const listMissingChapterIds = vi.fn(async () => [...missing])
  const save = vi.fn(async (summary: ChapterSummary) => {
    saved.push(summary)
    return summary
  })
  const repo: ChapterSummaryRepository = {
    save,
    findByChapterId: vi.fn(async () => null),
    listMissingChapterIds,
  }
  return { repo, saved, listMissingChapterIds, save }
}

interface GeneratorMock {
  generator: ChapterSummaryGenerator
  generate: ReturnType<typeof vi.fn>
  calls: Array<{ chapter: ParsedChapter; language: SupportedLanguage }>
}

interface GeneratorOptions {
  failAtCallIndex?: number
  failure?: Error
}

function makeGenerator(opts: GeneratorOptions = {}): GeneratorMock {
  const calls: Array<{ chapter: ParsedChapter; language: SupportedLanguage }> = []
  let callIndex = 0
  const generate = vi.fn(
    async (
      chapter: ParsedChapter,
      language: SupportedLanguage,
    ): Promise<ChapterSummaryGeneration> => {
      const i = callIndex++
      calls.push({ chapter, language })
      if (opts.failAtCallIndex !== undefined && i === opts.failAtCallIndex) {
        throw opts.failure ?? new SummarizeError('Anthropic 429 rate limited')
      }
      return {
        summary: `Summary of ${chapter.title}`,
        tokenCount: 42,
        model: 'mock-summary-generator',
      }
    },
  )
  return { generator: { generate }, generate, calls }
}

function buildDeps(options: {
  book?: BookRecordForStage
  chapters: readonly Chapter[]
  missingChapterIds: readonly string[]
  generator?: GeneratorMock
}) {
  const book = options.book ?? makeBook()
  const { db, updates } = makeMockDb(book)
  const pgboss = makePgBoss()
  const { logger, logs } = makeLogger()
  const chapterRepo = makeChapterRepo(options.chapters)
  const summaryRepo = makeSummaryRepo(options.missingChapterIds)
  const generator = options.generator ?? makeGenerator()
  const deps: SummarizeStageDeps = {
    db,
    logger,
    pgboss,
    chapterRepo: chapterRepo.repo,
    chapterSummaryRepo: summaryRepo.repo,
    chapterSummaryGenerator: generator.generator,
  }
  return { deps, db, updates, pgboss, logger, logs, chapterRepo, summaryRepo, generator }
}

function progressValues(updates: readonly UpdateCall[]): number[] {
  return updates
    .map((u) => u.set.ingestionProgress)
    .filter((v): v is number => typeof v === 'number')
}

describe('summarizeStage — happy path: 3 chapters missing', () => {
  it('generates and saves 3 summaries, then enqueues ingestion.embed', async () => {
    const chapters = [makeChapter(0), makeChapter(1), makeChapter(2)]
    const ctx = buildDeps({
      chapters,
      missingChapterIds: chapters.map((c) => c.id),
    })

    await summarizeStage({ bookId: BOOK_ID }, ctx.deps)

    expect(ctx.generator.generate).toHaveBeenCalledTimes(3)
    expect(ctx.summaryRepo.save).toHaveBeenCalledTimes(3)
    expect(ctx.summaryRepo.saved.map((s) => s.chapterId)).toEqual(chapters.map((c) => c.id))
    for (const summary of ctx.summaryRepo.saved) {
      expect(summary.bookId).toBe(BOOK_ID)
      expect(summary.summary).toMatch(/Summary of Chapter/)
      expect(summary.model).toBe('mock-summary-generator')
    }
    expect(ctx.pgboss.send).toHaveBeenCalledWith('ingestion.embed', { bookId: BOOK_ID })
  })
})

describe('summarizeStage — resume: 2/3 already summarized', () => {
  it('generates and saves only the missing chapter, then enqueues ingestion.embed', async () => {
    const chapters = [makeChapter(0), makeChapter(1), makeChapter(2)]
    const lastChapter = chapters[2]
    if (!lastChapter) throw new Error('expected three chapters')

    const ctx = buildDeps({
      chapters,
      missingChapterIds: [lastChapter.id],
    })

    await summarizeStage({ bookId: BOOK_ID }, ctx.deps)

    expect(ctx.generator.generate).toHaveBeenCalledTimes(1)
    expect(ctx.summaryRepo.save).toHaveBeenCalledTimes(1)
    expect(ctx.summaryRepo.saved[0]?.chapterId).toBe(lastChapter.id)
    expect(ctx.pgboss.send).toHaveBeenCalledWith('ingestion.embed', { bookId: BOOK_ID })
    expect(progressValues(ctx.updates)).toContain(100)
  })
})

describe('summarizeStage — all summarized: nothing missing', () => {
  it('does not call the generator and immediately enqueues ingestion.embed', async () => {
    const chapters = [makeChapter(0), makeChapter(1), makeChapter(2)]
    const ctx = buildDeps({
      chapters,
      missingChapterIds: [],
    })

    await summarizeStage({ bookId: BOOK_ID }, ctx.deps)

    expect(ctx.generator.generate).not.toHaveBeenCalled()
    expect(ctx.summaryRepo.save).not.toHaveBeenCalled()
    expect(ctx.pgboss.send).toHaveBeenCalledWith('ingestion.embed', { bookId: BOOK_ID })
    expect(progressValues(ctx.updates)).toContain(100)
  })
})

describe('summarizeStage — generator fails on chapter 2 of 3', () => {
  it('persists the first summary, marks failed, does NOT re-throw, no embed enqueued', async () => {
    const chapters = [makeChapter(0), makeChapter(1), makeChapter(2)]
    const generator = makeGenerator({
      failAtCallIndex: 1,
      failure: new SummarizeError('Anthropic 429 rate limited'),
    })
    const ctx = buildDeps({
      chapters,
      missingChapterIds: chapters.map((c) => c.id),
      generator,
    })

    await expect(summarizeStage({ bookId: BOOK_ID }, ctx.deps)).resolves.toBeUndefined()

    expect(ctx.generator.generate).toHaveBeenCalledTimes(2)
    expect(ctx.summaryRepo.save).toHaveBeenCalledTimes(1)
    expect(ctx.summaryRepo.saved[0]?.chapterId).toBe(chapters[0]?.id)

    expect(ctx.pgboss.send).not.toHaveBeenCalled()

    const failureUpdate = ctx.updates.at(-1)?.set
    expect(failureUpdate?.ingestionStatus).toBe('failed')
    expect(failureUpdate?.ingestionLastStage).toBe('summarize')
    expect(String(failureUpdate?.ingestionError ?? '')).toContain('ingestion-summarize-failed')
    expect(String(failureUpdate?.ingestionError ?? '')).toContain('Anthropic 429 rate limited')

    const errorLog = ctx.logs.find((l) => l.level === 'error')
    expect(errorLog?.meta).toMatchObject({
      stage: 'summarize',
      error_slug: 'ingestion-summarize-failed',
      retryable: true,
      book_id: BOOK_ID,
    })
  })

  it('wraps a non-SummarizeError into SummarizeError', async () => {
    const chapters = [makeChapter(0), makeChapter(1), makeChapter(2)]
    const generator = makeGenerator({
      failAtCallIndex: 1,
      failure: new Error('connection lost'),
    })
    const ctx = buildDeps({
      chapters,
      missingChapterIds: chapters.map((c) => c.id),
      generator,
    })

    await expect(summarizeStage({ bookId: BOOK_ID }, ctx.deps)).resolves.toBeUndefined()

    const failureUpdate = ctx.updates.at(-1)?.set
    expect(failureUpdate?.ingestionStatus).toBe('failed')
    expect(String(failureUpdate?.ingestionError ?? '')).toContain('ingestion-summarize-failed')
    expect(ctx.pgboss.send).not.toHaveBeenCalled()
  })
})

describe('summarizeStage — language passthrough', () => {
  it('passes "en" to the generator for an EN book', async () => {
    const chapters = [makeChapter(0)]
    const ctx = buildDeps({
      book: makeBook({ languages: ['en'] }),
      chapters,
      missingChapterIds: [chapters[0]?.id ?? ''],
    })

    await summarizeStage({ bookId: BOOK_ID }, ctx.deps)

    expect(ctx.generator.calls[0]?.language).toBe('en')
  })

  it('passes "pt" to the generator for a PT book', async () => {
    const chapters = [makeChapter(0)]
    const ctx = buildDeps({
      book: makeBook({ languages: ['pt'] }),
      chapters,
      missingChapterIds: [chapters[0]?.id ?? ''],
    })

    await summarizeStage({ bookId: BOOK_ID }, ctx.deps)

    expect(ctx.generator.calls[0]?.language).toBe('pt')
  })

  it('falls back to "en" when languages[0] is unknown', async () => {
    const chapters = [makeChapter(0)]
    const ctx = buildDeps({
      book: makeBook({ languages: ['fr'] }),
      chapters,
      missingChapterIds: [chapters[0]?.id ?? ''],
    })

    await summarizeStage({ bookId: BOOK_ID }, ctx.deps)

    expect(ctx.generator.calls[0]?.language).toBe('en')
  })
})

describe('summarizeStage — progress reporting', () => {
  it('emits progress values 33, 66, 100 for 3 missing chapters', async () => {
    const chapters = [makeChapter(0), makeChapter(1), makeChapter(2)]
    const ctx = buildDeps({
      chapters,
      missingChapterIds: chapters.map((c) => c.id),
    })

    await summarizeStage({ bookId: BOOK_ID }, ctx.deps)

    const progress = progressValues(ctx.updates)
    expect(progress[0]).toBe(0)
    expect(progress).toContain(33)
    expect(progress).toContain(66)
    expect(progress).toContain(100)
  })

  it('marks status summarizing on the initial update', async () => {
    const chapters = [makeChapter(0)]
    const ctx = buildDeps({
      chapters,
      missingChapterIds: [chapters[0]?.id ?? ''],
    })

    await summarizeStage({ bookId: BOOK_ID }, ctx.deps)

    expect(ctx.updates[0]?.set.ingestionStatus).toBe('summarizing')
    expect(ctx.updates[0]?.set.ingestionLastStage).toBe('summarize')
  })
})

describe('IngestionStatus Zod enum', () => {
  it('accepts the new "summarizing" value', () => {
    expect(() => ingestionStatusEnum.parse('summarizing')).not.toThrow()
    expect(INGESTION_STATUS_VALUES).toContain('summarizing')
  })

  it('orders summarizing between chunking and embedding', () => {
    const idx = INGESTION_STATUS_VALUES.indexOf('summarizing')
    expect(INGESTION_STATUS_VALUES[idx - 1]).toBe('chunking')
    expect(INGESTION_STATUS_VALUES[idx + 1]).toBe('embedding')
  })

  it('rejects unrelated misspellings like "summarise"', () => {
    expect(() => ingestionStatusEnum.parse('summarise')).toThrow()
  })
})
