import type { Database } from '@dialogus/db/client'
import type { PgBoss } from '@dialogus/db/pgboss'
import { describe, expect, it, vi } from 'vitest'
import type { BookRecordForStage } from '../../../src/application/stages/_common'
import { type ParseStageDeps, parseStage } from '../../../src/application/stages/parse'
import type { Chapter } from '../../../src/domain/chapter/Chapter'
import type { ChapterRepository } from '../../../src/domain/chapter/ChapterRepository.port'
import { ParseError } from '../../../src/domain/ingestion/IngestionError'
import type {
  ChapterParser,
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
    ingestionStatus: 'cleaning',
    ingestionLastStage: 'clean',
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

function makeLogger(): { logger: ParseStageDeps['logger']; logs: CapturedLog[] } {
  const logs: CapturedLog[] = []
  const logger: ParseStageDeps['logger'] = {
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
  const send = vi.fn(async () => 'job-id-789')
  return { send } as unknown as PgBoss & { send: ReturnType<typeof vi.fn> }
}

function makeChapterRepo(overrides: Partial<ChapterRepository> = {}): ChapterRepository & {
  saveMany: ReturnType<typeof vi.fn>
  countByBookId: ReturnType<typeof vi.fn>
} {
  const saveMany = vi.fn(async (_chapters: readonly Chapter[]) => {})
  const countByBookId = vi.fn(async (_bookId: string) => 0)
  return {
    saveMany,
    countByBookId,
    listByBookId: async () => [],
    findById: async () => null,
    ...overrides,
  } as unknown as ChapterRepository & {
    saveMany: ReturnType<typeof vi.fn>
    countByBookId: ReturnType<typeof vi.fn>
  }
}

function buildParsed(ordinal: number): ParsedChapter {
  return {
    ordinal,
    title: `Chapter ${ordinal}`,
    plainText: `body ${ordinal}`,
    tokenCount: 100 + ordinal,
  }
}

function chapterParserOf(parsed: ParsedChapter[]): ChapterParser & {
  parse: ReturnType<typeof vi.fn>
} {
  const parse = vi.fn(async function* (
    _path: string,
    _language: SupportedLanguage,
  ): AsyncIterable<ParsedChapter> {
    for (const ch of parsed) yield ch
  })
  return { parse } as unknown as ChapterParser & { parse: ReturnType<typeof vi.fn> }
}

function failingParser(error: Error, yieldBefore: number = 0): ChapterParser {
  return {
    parse: async function* (
      _path: string,
      _language: SupportedLanguage,
    ): AsyncIterable<ParsedChapter> {
      for (let i = 1; i <= yieldBefore; i++) yield buildParsed(i)
      throw error
    },
  }
}

describe('parseStage — EPUB path', () => {
  it('uses chapterParser against ./storage/raw/<id>.epub when book has EPUB url', async () => {
    const book = makeBook({
      downloadUrlEpub: 'https://example.test/epub',
      downloadUrlTxt: null,
    })
    const { db, updates } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const epubParser = chapterParserOf([buildParsed(1), buildParsed(2), buildParsed(3)])
    const txtParser = chapterParserOf([])
    const chapterRepo = makeChapterRepo()

    await parseStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo,
        chapterParser: epubParser,
        txtChapterParser: txtParser,
        storageRoot: '/tmp/storage',
      },
    )

    expect(epubParser.parse).toHaveBeenCalledTimes(1)
    expect(epubParser.parse).toHaveBeenCalledWith(`/tmp/storage/raw/${GUTENDEX_ID}.epub`, 'en')
    expect(txtParser.parse).not.toHaveBeenCalled()
    expect(chapterRepo.saveMany).toHaveBeenCalledTimes(1)
    const savedBatch = chapterRepo.saveMany.mock.calls[0]?.[0] as Chapter[]
    expect(savedBatch).toHaveLength(3)
    expect(savedBatch[0]).toMatchObject({ bookId: BOOK_ID, ordinal: 1, title: 'Chapter 1' })
    expect(savedBatch[0]?.id).toBeTypeOf('string')
    expect(pgboss.send).toHaveBeenCalledWith('ingestion.chunk', { bookId: BOOK_ID })
    expect(updates[0]?.set.ingestionStatus).toBe('parsing')
    expect(updates[0]?.set.ingestionProgress).toBe(0)
    expect(updates[0]?.set.ingestionLastStage).toBe('parse')
    expect(updates.some((u) => u.set.ingestionProgress === 100)).toBe(true)
  })
})

describe('parseStage — TXT path', () => {
  it('uses txtChapterParser against ./storage/clean/<id>.txt when book has only TXT url', async () => {
    const book = makeBook({
      downloadUrlEpub: null,
      downloadUrlTxt: 'https://example.test/txt',
      languages: ['pt'],
    })
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const epubParser = chapterParserOf([])
    const txtParser = chapterParserOf([buildParsed(1), buildParsed(2)])
    const chapterRepo = makeChapterRepo()

    await parseStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo,
        chapterParser: epubParser,
        txtChapterParser: txtParser,
        storageRoot: '/tmp/storage',
      },
    )

    expect(txtParser.parse).toHaveBeenCalledTimes(1)
    expect(txtParser.parse).toHaveBeenCalledWith(`/tmp/storage/clean/${GUTENDEX_ID}.txt`, 'pt')
    expect(epubParser.parse).not.toHaveBeenCalled()
    expect(chapterRepo.saveMany).toHaveBeenCalledTimes(1)
    expect(pgboss.send).toHaveBeenCalledWith('ingestion.chunk', { bookId: BOOK_ID })
  })
})

describe('parseStage — fallback wrapper passthrough', () => {
  it('invokes the EPUB parser dep even when its parse() yields nothing then we throw', async () => {
    const book = makeBook()
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    // Simulate EpubChapterParserWithFallback being injected as the chapterParser dep.
    // The wrapper internally falls back; from parseStage's view, only one parse() call happens.
    const fallbackInvoked = vi.fn()
    const wrapper: ChapterParser = {
      parse: async function* (path, language) {
        fallbackInvoked(path, language)
        yield buildParsed(1)
        yield buildParsed(2)
      },
    }
    const txtParser = chapterParserOf([])
    const chapterRepo = makeChapterRepo()

    await parseStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo,
        chapterParser: wrapper,
        txtChapterParser: txtParser,
        storageRoot: '/tmp/storage',
      },
    )

    expect(fallbackInvoked).toHaveBeenCalledTimes(1)
    expect(chapterRepo.saveMany).toHaveBeenCalledTimes(1)
  })
})

describe('parseStage — batching', () => {
  it('flushes saveMany every 50 chapters (100 total → 2 batches of 50)', async () => {
    const parsed = Array.from({ length: 100 }, (_, i) => buildParsed(i + 1))
    const book = makeBook()
    const { db, updates } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger, logs } = makeLogger()
    const epubParser = chapterParserOf(parsed)
    const txtParser = chapterParserOf([])
    const chapterRepo = makeChapterRepo()

    await parseStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo,
        chapterParser: epubParser,
        txtChapterParser: txtParser,
      },
    )

    expect(chapterRepo.saveMany).toHaveBeenCalledTimes(2)
    expect((chapterRepo.saveMany.mock.calls[0]?.[0] as Chapter[]).length).toBe(50)
    expect((chapterRepo.saveMany.mock.calls[1]?.[0] as Chapter[]).length).toBe(50)
    // initial parsing/0, intermediate batch progress, final 100 ⇒ at least 2 progress-bearing updates.
    const progressUpdates = updates.filter((u) => u.set.ingestionProgress !== undefined)
    expect(progressUpdates.length).toBeGreaterThanOrEqual(2)
    const batchLogs = logs.filter((l) => l.meta.event === 'parse_batch_persisted')
    expect(batchLogs).toHaveLength(2)
    expect(batchLogs[0]?.meta).toMatchObject({
      stage: 'parse',
      book_id: BOOK_ID,
      batch_size: 50,
      chapters_persisted_so_far: 50,
    })
    expect(batchLogs[1]?.meta).toMatchObject({ batch_size: 50, chapters_persisted_so_far: 100 })
  })

  it('flushes a partial trailing batch (75 → 50 + 25)', async () => {
    const parsed = Array.from({ length: 75 }, (_, i) => buildParsed(i + 1))
    const book = makeBook()
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const epubParser = chapterParserOf(parsed)
    const txtParser = chapterParserOf([])
    const chapterRepo = makeChapterRepo()

    await parseStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo,
        chapterParser: epubParser,
        txtChapterParser: txtParser,
      },
    )

    expect(chapterRepo.saveMany).toHaveBeenCalledTimes(2)
    expect((chapterRepo.saveMany.mock.calls[0]?.[0] as Chapter[]).length).toBe(50)
    expect((chapterRepo.saveMany.mock.calls[1]?.[0] as Chapter[]).length).toBe(25)
  })
})

describe('parseStage — upstream check (resume)', () => {
  it('skips parsing and enqueues chunk when chapters already exist', async () => {
    const book = makeBook()
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger, logs } = makeLogger()
    const epubParser = chapterParserOf([buildParsed(1)])
    const txtParser = chapterParserOf([])
    const chapterRepo = makeChapterRepo({
      countByBookId: vi.fn(async () => 5),
    } as Partial<ChapterRepository>)

    await parseStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo,
        chapterParser: epubParser,
        txtChapterParser: txtParser,
      },
    )

    expect(epubParser.parse).not.toHaveBeenCalled()
    expect(txtParser.parse).not.toHaveBeenCalled()
    expect(chapterRepo.saveMany).not.toHaveBeenCalled()
    expect(pgboss.send).toHaveBeenCalledWith('ingestion.chunk', { bookId: BOOK_ID })
    const completion = logs.find((l) => l.meta.event === 'stage_completed')
    expect(completion?.meta).toMatchObject({
      cache_hit: true,
      chapters_count: 5,
    })
  })
})

describe('parseStage — empty chapters pathological', () => {
  it('throws ParseError with ingestion-parse-failed slug when parser yields zero chapters', async () => {
    const book = makeBook()
    const { db, updates } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger, logs } = makeLogger()
    const epubParser = chapterParserOf([])
    const txtParser = chapterParserOf([])
    const chapterRepo = makeChapterRepo()

    await expect(
      parseStage(
        { bookId: BOOK_ID },
        {
          db,
          logger,
          pgboss,
          chapterRepo,
          chapterParser: epubParser,
          txtChapterParser: txtParser,
        },
      ),
    ).rejects.toBeInstanceOf(ParseError)

    expect(chapterRepo.saveMany).not.toHaveBeenCalled()
    expect(pgboss.send).not.toHaveBeenCalled()
    const failureUpdate = updates.at(-1)?.set
    expect(failureUpdate?.ingestionStatus).toBe('failed')
    expect(failureUpdate?.ingestionError).toContain('ingestion-parse-failed')
    const errLog = logs.find((l) => l.level === 'error')
    expect(errLog?.meta).toMatchObject({
      stage: 'parse',
      error_slug: 'ingestion-parse-failed',
      retryable: false,
    })
  })
})

describe('parseStage — mid-stream parser failure', () => {
  it('marks the book failed and rethrows when the parser throws partway through', async () => {
    const book = makeBook()
    const { db, updates } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger, logs } = makeLogger()
    const epubParser = failingParser(new Error('boom'), 2)
    const txtParser = chapterParserOf([])
    const chapterRepo = makeChapterRepo()

    await expect(
      parseStage(
        { bookId: BOOK_ID },
        {
          db,
          logger,
          pgboss,
          chapterRepo,
          chapterParser: epubParser,
          txtChapterParser: txtParser,
        },
      ),
    ).rejects.toBeInstanceOf(ParseError)

    expect(pgboss.send).not.toHaveBeenCalled()
    const failureUpdate = updates.at(-1)?.set
    expect(failureUpdate?.ingestionStatus).toBe('failed')
    expect(failureUpdate?.ingestionError).toContain('ingestion-parse-failed')
    expect(logs.find((l) => l.level === 'error')?.meta.stage).toBe('parse')
  })

  it('preserves an existing ParseError without rewrapping', async () => {
    const book = makeBook()
    const { db, updates } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const explicit = new ParseError('explicit parser failure')
    const epubParser = failingParser(explicit, 0)
    const txtParser = chapterParserOf([])
    const chapterRepo = makeChapterRepo()

    await expect(
      parseStage(
        { bookId: BOOK_ID },
        {
          db,
          logger,
          pgboss,
          chapterRepo,
          chapterParser: epubParser,
          txtChapterParser: txtParser,
        },
      ),
    ).rejects.toBe(explicit)

    expect(updates.at(-1)?.set.ingestionError).toContain('explicit parser failure')
  })
})

describe('parseStage — language resolution', () => {
  it('selects pt when book.languages contains pt-br variants', async () => {
    const book = makeBook({ languages: ['pt-br'] })
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const epubParser = chapterParserOf([buildParsed(1)])
    const txtParser = chapterParserOf([])
    const chapterRepo = makeChapterRepo()

    await parseStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo,
        chapterParser: epubParser,
        txtChapterParser: txtParser,
      },
    )

    expect(epubParser.parse).toHaveBeenCalledWith(expect.any(String), 'pt')
  })

  it('falls back to en when languages array is empty or unknown', async () => {
    const book = makeBook({ languages: ['xx', 'fr'] })
    const { db } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger } = makeLogger()
    const epubParser = chapterParserOf([buildParsed(1)])
    const txtParser = chapterParserOf([])
    const chapterRepo = makeChapterRepo()

    await parseStage(
      { bookId: BOOK_ID },
      {
        db,
        logger,
        pgboss,
        chapterRepo,
        chapterParser: epubParser,
        txtChapterParser: txtParser,
      },
    )

    expect(epubParser.parse).toHaveBeenCalledWith(expect.any(String), 'en')
  })
})
