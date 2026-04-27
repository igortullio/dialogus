import { isValidationError } from '@mastra/core/tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LIST_CHAPTERS_TOOL_DESCRIPTION,
  LIST_CHAPTERS_TOOL_ID,
  type ListChaptersLogger,
  type ListChaptersToolDeps,
  listChaptersTool,
} from '../../../src/application/tools/listChapters'
import type { ChapterView } from '../../../src/domain/entities/ChapterView'
import type { ChapterReadRepository } from '../../../src/domain/ports/ChapterReadRepository.port'

const BOOK_ID = '11111111-1111-4111-8111-111111111111'
const CHAPTER_ID_1 = '22222222-2222-4222-8222-222222222222'
const CHAPTER_ID_2 = '33333333-3333-4333-8333-333333333333'
const CHAPTER_ID_3 = '44444444-4444-4444-8444-444444444444'

interface CapturedLog {
  readonly level: 'info' | 'error'
  readonly meta: Record<string, unknown>
  readonly msg: string
}

function makeLogger(): { logger: ListChaptersLogger; logs: CapturedLog[] } {
  const logs: CapturedLog[] = []
  const logger: ListChaptersLogger = {
    info(meta, msg) {
      logs.push({ level: 'info', meta, msg })
    },
    error(meta, msg) {
      logs.push({ level: 'error', meta, msg })
    },
  }
  return { logger, logs }
}

function makeChapter(overrides: Partial<ChapterView> = {}): ChapterView {
  return {
    id: CHAPTER_ID_1,
    bookId: BOOK_ID,
    ordinal: 1,
    title: 'Loomings',
    tokenCount: 1234,
    ...overrides,
  }
}

function makeChapterRepo(listByBook: ChapterReadRepository['listByBook']): ChapterReadRepository {
  return {
    listByBook,
    findById: vi.fn(),
  }
}

interface ToolFixture {
  readonly tool: ReturnType<typeof listChaptersTool>
  readonly deps: ListChaptersToolDeps
  readonly logs: CapturedLog[]
  readonly listByBook: ReturnType<typeof vi.fn>
}

interface FixtureOptions {
  readonly chapters?: ChapterView[]
  readonly listImpl?: (bookId: string) => Promise<ChapterView[]>
}

function makeFixture(options: FixtureOptions = {}): ToolFixture {
  const defaultList = async () => options.chapters ?? [makeChapter()]
  const listByBook = vi.fn(options.listImpl ?? defaultList)
  const chapterRepo = makeChapterRepo(listByBook)
  const { logger, logs } = makeLogger()
  const deps: ListChaptersToolDeps = { chapterRepo, logger }
  const tool = listChaptersTool(deps)
  return { tool, deps, logs, listByBook }
}

beforeEach(() => {
  vi.useRealTimers()
})

describe('listChaptersTool — metadata', () => {
  it('exposes the canonical id and description', () => {
    const { tool } = makeFixture()
    expect(tool.id).toBe(LIST_CHAPTERS_TOOL_ID)
    expect(tool.description).toBe(LIST_CHAPTERS_TOOL_DESCRIPTION)
    expect(tool.inputSchema).toBeDefined()
    expect(tool.outputSchema).toBeDefined()
  })
})

describe('listChaptersTool — happy path', () => {
  it('returns 3 chapters in ordinal order with snake_case fields', async () => {
    const repoChapters = [
      makeChapter({ id: CHAPTER_ID_2, ordinal: 2, title: 'The Carpet-Bag', tokenCount: 800 }),
      makeChapter({ id: CHAPTER_ID_1, ordinal: 1, title: 'Loomings', tokenCount: 1500 }),
      makeChapter({ id: CHAPTER_ID_3, ordinal: 3, title: 'The Spouter-Inn', tokenCount: 2100 }),
    ]
    const fixture = makeFixture({ chapters: repoChapters })

    const result = await fixture.tool.execute?.({ book_id: BOOK_ID }, {})

    expect(result).toBeDefined()
    if (!result || isValidationError(result)) {
      throw new Error('expected a successful tool output')
    }
    expect(fixture.listByBook).toHaveBeenCalledTimes(1)
    expect(fixture.listByBook).toHaveBeenCalledWith(BOOK_ID)
    expect(result.chapters).toHaveLength(3)
    expect(result.chapters.map((c) => c.ordinal)).toEqual([1, 2, 3])
    expect(result.chapters[0]).toEqual({
      chapter_id: CHAPTER_ID_1,
      ordinal: 1,
      title: 'Loomings',
      token_count: 1500,
    })
    expect(result.chapters[0] as unknown as Record<string, unknown>).not.toHaveProperty('id')
    expect(result.chapters[0] as unknown as Record<string, unknown>).not.toHaveProperty('bookId')
    expect(result.chapters[0] as unknown as Record<string, unknown>).not.toHaveProperty(
      'tokenCount',
    )
  })
})

describe('listChaptersTool — edge cases', () => {
  it('returns an empty chapters array when the repo returns no chapters', async () => {
    const fixture = makeFixture({ chapters: [] })

    const result = await fixture.tool.execute?.({ book_id: BOOK_ID }, {})

    if (!result || isValidationError(result)) {
      throw new Error('expected a successful tool output')
    }
    expect(result.chapters).toEqual([])
  })

  it('handles a single "Full text" fallback chapter with no special-casing', async () => {
    const fullTextChapter = makeChapter({
      id: CHAPTER_ID_1,
      ordinal: 1,
      title: 'Full text',
      tokenCount: 50000,
    })
    const fixture = makeFixture({ chapters: [fullTextChapter] })

    const result = await fixture.tool.execute?.({ book_id: BOOK_ID }, {})

    if (!result || isValidationError(result)) {
      throw new Error('expected a successful tool output')
    }
    expect(result.chapters).toHaveLength(1)
    expect(result.chapters[0]?.title).toBe('Full text')
    expect(result.chapters[0]?.ordinal).toBe(1)
  })
})

describe('listChaptersTool — input validation', () => {
  it('rejects a non-UUID book_id without invoking the repo', async () => {
    const fixture = makeFixture()

    const result = await fixture.tool.execute?.({ book_id: 'not-a-uuid' } as never, {})

    expect(result).toBeDefined()
    expect(isValidationError(result)).toBe(true)
    expect(fixture.listByBook).not.toHaveBeenCalled()
  })

  it('rejects a missing book_id without invoking the repo', async () => {
    const fixture = makeFixture()

    const result = await fixture.tool.execute?.({} as never, {})

    expect(isValidationError(result)).toBe(true)
    expect(fixture.listByBook).not.toHaveBeenCalled()
  })
})

describe('listChaptersTool — error propagation', () => {
  it('rethrows repo errors and logs an error event', async () => {
    const original = new Error('db down')
    const fixture = makeFixture({
      listImpl: async () => {
        throw original
      },
    })

    await expect(fixture.tool.execute?.({ book_id: BOOK_ID }, {})).rejects.toBe(original)
    const errorLog = fixture.logs.find((log) => log.level === 'error')
    expect(errorLog?.meta).toMatchObject({
      tool: LIST_CHAPTERS_TOOL_ID,
      event: 'tool_call',
      book_id: BOOK_ID,
    })
  })
})

describe('listChaptersTool — structured logging', () => {
  it('emits a single info log with chapter_count + thread_id after a successful call', async () => {
    const fixture = makeFixture({
      chapters: [
        makeChapter({ id: CHAPTER_ID_1, ordinal: 1 }),
        makeChapter({ id: CHAPTER_ID_2, ordinal: 2 }),
      ],
    })

    await fixture.tool.execute?.({ book_id: BOOK_ID }, {
      agent: {
        agentId: 'dialogus',
        toolCallId: 'tc-1',
        messages: [],
        threadId: 'thread-abc',
        suspend: async () => undefined,
      },
      // biome-ignore lint/suspicious/noExplicitAny: minimal mock shape suffices for this unit test
    } as any)

    const infoLogs = fixture.logs.filter((log) => log.level === 'info')
    expect(infoLogs).toHaveLength(1)
    const meta = infoLogs[0]?.meta ?? {}
    expect(meta).toMatchObject({
      event: 'tool_call',
      tool: LIST_CHAPTERS_TOOL_ID,
      thread_id: 'thread-abc',
      book_id: BOOK_ID,
      chapter_count: 2,
    })
    expect(typeof meta.duration_ms).toBe('number')
    expect(meta.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('omits thread_id when no agent context is provided', async () => {
    const fixture = makeFixture({ chapters: [] })

    await fixture.tool.execute?.({ book_id: BOOK_ID }, {})

    const infoLog = fixture.logs.find((log) => log.level === 'info')
    expect(infoLog).toBeDefined()
    expect(infoLog?.meta).toMatchObject({
      tool: LIST_CHAPTERS_TOOL_ID,
      book_id: BOOK_ID,
      chapter_count: 0,
    })
    expect('thread_id' in (infoLog?.meta ?? {})).toBe(false)
  })
})
