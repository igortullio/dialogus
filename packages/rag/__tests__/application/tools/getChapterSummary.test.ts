import { isValidationError } from '@mastra/core/tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GET_CHAPTER_SUMMARY_TOOL_DESCRIPTION,
  GET_CHAPTER_SUMMARY_TOOL_ID,
  type GetChapterSummaryLogger,
  type GetChapterSummaryToolDeps,
  getChapterSummaryTool,
} from '../../../src/application/tools/getChapterSummary'
import type { ChapterSummaryView } from '../../../src/domain/entities/ChapterSummaryView'
import { SummaryNotFoundError } from '../../../src/domain/errors/RagError'
import type { ChapterSummaryReadRepository } from '../../../src/domain/ports/ChapterSummaryReadRepository.port'

const BOOK_ID = '11111111-1111-4111-8111-111111111111'
const CHAPTER_ID = '22222222-2222-4222-8222-222222222222'

interface CapturedLog {
  readonly level: 'info' | 'error'
  readonly meta: Record<string, unknown>
  readonly msg: string
}

function makeLogger(): { logger: GetChapterSummaryLogger; logs: CapturedLog[] } {
  const logs: CapturedLog[] = []
  const logger: GetChapterSummaryLogger = {
    info(meta, msg) {
      logs.push({ level: 'info', meta, msg })
    },
    error(meta, msg) {
      logs.push({ level: 'error', meta, msg })
    },
  }
  return { logger, logs }
}

function makeSummary(overrides: Partial<ChapterSummaryView> = {}): ChapterSummaryView {
  return {
    bookId: BOOK_ID,
    chapterId: CHAPTER_ID,
    chapterOrdinal: 5,
    chapterTitle: 'Breakfast',
    summary: 'Ishmael sits with the harpooners and reflects on the morning.',
    tokenCount: 320,
    model: 'claude-haiku-4-5',
    generatedAt: new Date('2026-04-20T12:00:00Z'),
    ...overrides,
  }
}

function makeRepo(
  findByChapterId: ChapterSummaryReadRepository['findByChapterId'],
): ChapterSummaryReadRepository {
  return {
    findByChapterId,
  }
}

interface ToolFixture {
  readonly tool: ReturnType<typeof getChapterSummaryTool>
  readonly deps: GetChapterSummaryToolDeps
  readonly logs: CapturedLog[]
  readonly findByChapterId: ReturnType<typeof vi.fn>
}

interface FixtureOptions {
  readonly summary?: ChapterSummaryView | null
  readonly findImpl?: (chapterId: string) => Promise<ChapterSummaryView | null>
}

function makeFixture(options: FixtureOptions = {}): ToolFixture {
  const defaultFind = async () => (options.summary === undefined ? makeSummary() : options.summary)
  const findByChapterId = vi.fn(options.findImpl ?? defaultFind)
  const chapterSummaryRepo = makeRepo(findByChapterId)
  const { logger, logs } = makeLogger()
  const deps: GetChapterSummaryToolDeps = { chapterSummaryRepo, logger }
  const tool = getChapterSummaryTool(deps)
  return { tool, deps, logs, findByChapterId }
}

beforeEach(() => {
  vi.useRealTimers()
})

describe('getChapterSummaryTool — metadata', () => {
  it('exposes the canonical id and description', () => {
    const { tool } = makeFixture()
    expect(tool.id).toBe(GET_CHAPTER_SUMMARY_TOOL_ID)
    expect(tool.description).toBe(GET_CHAPTER_SUMMARY_TOOL_DESCRIPTION)
    expect(tool.inputSchema).toBeDefined()
    expect(tool.outputSchema).toBeDefined()
  })
})

describe('getChapterSummaryTool — happy path', () => {
  it('returns the repo summary mapped to a snake_case DTO with ISO generated_at', async () => {
    const summary = makeSummary({
      summary: 'A chapter on Queequeg.',
      chapterOrdinal: 7,
      chapterTitle: 'A Bosom Friend',
      tokenCount: 410,
      model: 'claude-haiku-4-5-2026-04',
      generatedAt: new Date('2026-04-25T08:30:00Z'),
    })
    const fixture = makeFixture({ summary })

    const result = await fixture.tool.execute?.({ chapter_id: CHAPTER_ID }, {})

    expect(result).toBeDefined()
    if (!result || isValidationError(result)) {
      throw new Error('expected a successful tool output')
    }
    expect(fixture.findByChapterId).toHaveBeenCalledTimes(1)
    expect(fixture.findByChapterId).toHaveBeenCalledWith(CHAPTER_ID)
    expect(result).toEqual({
      summary: 'A chapter on Queequeg.',
      chapter_id: CHAPTER_ID,
      chapter_ordinal: 7,
      chapter_title: 'A Bosom Friend',
      book_id: BOOK_ID,
      token_count: 410,
      model: 'claude-haiku-4-5-2026-04',
      generated_at: '2026-04-25T08:30:00.000Z',
    })
    expect(result as unknown as Record<string, unknown>).not.toHaveProperty('chapterId')
    expect(result as unknown as Record<string, unknown>).not.toHaveProperty('chapterOrdinal')
    expect(result as unknown as Record<string, unknown>).not.toHaveProperty('generatedAt')
  })
})

describe('getChapterSummaryTool — missing summary', () => {
  it('throws SummaryNotFoundError when the repo returns null', async () => {
    const fixture = makeFixture({ summary: null })

    await expect(fixture.tool.execute?.({ chapter_id: CHAPTER_ID }, {})).rejects.toBeInstanceOf(
      SummaryNotFoundError,
    )
  })

  it('includes the chapter_id in the SummaryNotFoundError message', async () => {
    const fixture = makeFixture({ summary: null })

    let captured: unknown
    try {
      await fixture.tool.execute?.({ chapter_id: CHAPTER_ID }, {})
    } catch (error) {
      captured = error
    }
    expect(captured).toBeInstanceOf(SummaryNotFoundError)
    expect((captured as Error).message).toContain(CHAPTER_ID)
  })

  it('does NOT emit an info log on the missing-summary error path', async () => {
    const fixture = makeFixture({ summary: null })

    await expect(fixture.tool.execute?.({ chapter_id: CHAPTER_ID }, {})).rejects.toBeInstanceOf(
      SummaryNotFoundError,
    )

    const infoLogs = fixture.logs.filter((log) => log.level === 'info')
    expect(infoLogs).toHaveLength(0)
    const errorLogs = fixture.logs.filter((log) => log.level === 'error')
    expect(errorLogs).toHaveLength(1)
    expect(errorLogs[0]?.meta).not.toHaveProperty('hit')
  })
})

describe('getChapterSummaryTool — input validation', () => {
  it('rejects a non-UUID chapter_id without invoking the repo', async () => {
    const fixture = makeFixture()

    const result = await fixture.tool.execute?.({ chapter_id: 'not-a-uuid' } as never, {})

    expect(isValidationError(result)).toBe(true)
    expect(fixture.findByChapterId).not.toHaveBeenCalled()
  })

  it('rejects a missing chapter_id without invoking the repo', async () => {
    const fixture = makeFixture()

    const result = await fixture.tool.execute?.({} as never, {})

    expect(isValidationError(result)).toBe(true)
    expect(fixture.findByChapterId).not.toHaveBeenCalled()
  })
})

describe('getChapterSummaryTool — structured logging', () => {
  it('emits hit:true info log on success with thread_id', async () => {
    const fixture = makeFixture({ summary: makeSummary() })

    await fixture.tool.execute?.({ chapter_id: CHAPTER_ID }, {
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
      tool: GET_CHAPTER_SUMMARY_TOOL_ID,
      thread_id: 'thread-abc',
      chapter_id: CHAPTER_ID,
      hit: true,
    })
    expect(typeof meta.duration_ms).toBe('number')
    expect(meta.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('omits thread_id when no agent context is provided', async () => {
    const fixture = makeFixture({ summary: makeSummary() })

    await fixture.tool.execute?.({ chapter_id: CHAPTER_ID }, {})

    const infoLog = fixture.logs.find((log) => log.level === 'info')
    expect(infoLog).toBeDefined()
    expect(infoLog?.meta).toMatchObject({
      tool: GET_CHAPTER_SUMMARY_TOOL_ID,
      chapter_id: CHAPTER_ID,
      hit: true,
    })
    expect('thread_id' in (infoLog?.meta ?? {})).toBe(false)
  })
})
