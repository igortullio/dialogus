import { isValidationError } from '@mastra/core/tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FIND_CHARACTER_MENTIONS_DEFAULT_LIMIT,
  FIND_CHARACTER_MENTIONS_TOOL_DESCRIPTION,
  FIND_CHARACTER_MENTIONS_TOOL_ID,
  type FindCharacterMentionsLogger,
  type FindCharacterMentionsToolDeps,
  findCharacterMentionsTool,
} from '../../../src/application/tools/findCharacterMentions'
import type { ChunkWithContext } from '../../../src/domain/entities/ChunkWithContext'
import type {
  ChunkReadRepository,
  FindCharacterMentionsParams,
  SearchSemanticParams,
} from '../../../src/domain/ports/ChunkReadRepository.port'

const BOOK_ID_A = '11111111-1111-4111-8111-111111111111'
const BOOK_ID_B = '22222222-2222-4222-8222-222222222222'
const CHUNK_ID_1 = '33333333-3333-4333-8333-333333333333'
const CHUNK_ID_2 = '44444444-4444-4444-8444-444444444444'
const CHUNK_ID_3 = '55555555-5555-4555-8555-555555555555'
const CHAPTER_ID_1 = '66666666-6666-4666-8666-666666666666'
const CHAPTER_ID_2 = '77777777-7777-4777-8777-777777777777'

interface CapturedLog {
  readonly level: 'info' | 'error'
  readonly meta: Record<string, unknown>
  readonly msg: string
}

function makeLogger(): { logger: FindCharacterMentionsLogger; logs: CapturedLog[] } {
  const logs: CapturedLog[] = []
  const logger: FindCharacterMentionsLogger = {
    info(meta, msg) {
      logs.push({ level: 'info', meta, msg })
    },
    error(meta, msg) {
      logs.push({ level: 'error', meta, msg })
    },
  }
  return { logger, logs }
}

function makeChunk(overrides: Partial<ChunkWithContext> = {}): ChunkWithContext {
  return {
    chunkId: CHUNK_ID_1,
    bookId: BOOK_ID_A,
    chapterId: CHAPTER_ID_1,
    chapterOrdinal: 1,
    chapterTitle: 'Loomings',
    text: 'Call me Ishmael.',
    excerptPreview: 'Call me Ishmael.',
    score: 0,
    ...overrides,
  }
}

function makeChunkRepo(
  findCharacterMentions: ChunkReadRepository['findCharacterMentions'],
): ChunkReadRepository {
  return {
    searchSemantic: vi.fn() as unknown as (
      params: SearchSemanticParams,
    ) => Promise<ChunkWithContext[]>,
    findById: vi.fn(),
    findCharacterMentions,
  }
}

interface ToolFixture {
  readonly tool: ReturnType<typeof findCharacterMentionsTool>
  readonly deps: FindCharacterMentionsToolDeps
  readonly logs: CapturedLog[]
  readonly findCharacterMentions: ReturnType<typeof vi.fn>
}

interface FixtureOptions {
  readonly chunks?: ChunkWithContext[]
  readonly findImpl?: (params: FindCharacterMentionsParams) => Promise<ChunkWithContext[]>
}

function makeFixture(options: FixtureOptions = {}): ToolFixture {
  const defaultFind = async () => options.chunks ?? [makeChunk()]
  const findCharacterMentions = vi.fn(options.findImpl ?? defaultFind)
  const chunkRepo = makeChunkRepo(findCharacterMentions)
  const { logger, logs } = makeLogger()
  const deps: FindCharacterMentionsToolDeps = { chunkRepo, logger }
  const tool = findCharacterMentionsTool(deps)
  return { tool, deps, logs, findCharacterMentions }
}

beforeEach(() => {
  vi.useRealTimers()
})

describe('findCharacterMentionsTool — metadata', () => {
  it('exposes the canonical id and description', () => {
    const { tool } = makeFixture()
    expect(tool.id).toBe(FIND_CHARACTER_MENTIONS_TOOL_ID)
    expect(tool.description).toBe(FIND_CHARACTER_MENTIONS_TOOL_DESCRIPTION)
    expect(tool.inputSchema).toBeDefined()
    expect(tool.outputSchema).toBeDefined()
  })
})

describe('findCharacterMentionsTool — happy path', () => {
  it('forwards { bookIds, aliases, spoilerCaps, limit } to the repo and returns mapped mentions in repo order', async () => {
    const repoChunks = [
      makeChunk({ chunkId: CHUNK_ID_1, chapterOrdinal: 1, chapterId: CHAPTER_ID_1 }),
      makeChunk({ chunkId: CHUNK_ID_2, chapterOrdinal: 3, chapterId: CHAPTER_ID_2 }),
    ]
    const fixture = makeFixture({ chunks: repoChunks })

    const result = await fixture.tool.execute?.(
      { book_ids: [BOOK_ID_A], aliases: ['Ishmael'], limit: 20 },
      {},
    )

    expect(result).toBeDefined()
    if (!result || isValidationError(result)) {
      throw new Error('expected a successful tool output')
    }
    expect(fixture.findCharacterMentions).toHaveBeenCalledTimes(1)
    const params = fixture.findCharacterMentions.mock.calls[0]?.[0] as FindCharacterMentionsParams
    expect(params.bookIds).toEqual([BOOK_ID_A])
    expect(params.aliases).toEqual(['Ishmael'])
    expect(params.spoilerCaps).toBeUndefined()
    expect(params.limit).toBe(20)
    expect(result.mentions).toHaveLength(repoChunks.length)
    expect(result.mentions.map((m) => m.chapter_ordinal)).toEqual([1, 3])
    expect(result.mentions[0]?.chunk_id).toBe(CHUNK_ID_1)
    expect(result.mentions[1]?.chunk_id).toBe(CHUNK_ID_2)
  })

  it('converts entity camelCase fields to snake_case DTO keys', async () => {
    const chunk = makeChunk({
      chunkId: CHUNK_ID_3,
      bookId: BOOK_ID_A,
      chapterId: CHAPTER_ID_1,
      chapterOrdinal: 7,
      chapterTitle: 'A Bosom Friend',
      text: 'Better sleep with a sober cannibal than a drunken Christian.',
      excerptPreview: 'Better sleep with a sober cannibal than a drunken Christian.',
      score: 0,
    })
    const fixture = makeFixture({ chunks: [chunk] })

    const result = await fixture.tool.execute?.(
      { book_ids: [BOOK_ID_A], aliases: ['Queequeg'] },
      {},
    )

    if (!result || isValidationError(result)) {
      throw new Error('expected a successful tool output')
    }
    const first = result.mentions[0]
    expect(first?.chunk_id).toBe(chunk.chunkId)
    expect(first?.book_id).toBe(chunk.bookId)
    expect(first?.chapter_id).toBe(chunk.chapterId)
    expect(first?.chapter_ordinal).toBe(chunk.chapterOrdinal)
    expect(first?.chapter_title).toBe(chunk.chapterTitle)
    expect(first?.text).toBe(chunk.text)
    expect(first?.excerpt_preview).toBe(chunk.excerptPreview)
    expect(first as unknown as Record<string, unknown>).not.toHaveProperty('chunkId')
    expect(first as unknown as Record<string, unknown>).not.toHaveProperty('chapterOrdinal')
    expect(first as unknown as Record<string, unknown>).not.toHaveProperty('excerptPreview')
  })
})

describe('findCharacterMentionsTool — input forwarding', () => {
  it('forwards multi-alias arrays verbatim to the repo', async () => {
    const fixture = makeFixture({ chunks: [] })

    await fixture.tool.execute?.({ book_ids: [BOOK_ID_A], aliases: ['Ishmael', 'narrator'] }, {})

    const params = fixture.findCharacterMentions.mock.calls[0]?.[0] as FindCharacterMentionsParams
    expect(params.aliases).toEqual(['Ishmael', 'narrator'])
  })

  it('forwards multi-book search across all provided book ids', async () => {
    const fixture = makeFixture({ chunks: [] })

    await fixture.tool.execute?.({ book_ids: [BOOK_ID_A, BOOK_ID_B], aliases: ['Ahab'] }, {})

    const params = fixture.findCharacterMentions.mock.calls[0]?.[0] as FindCharacterMentionsParams
    expect(params.bookIds).toEqual([BOOK_ID_A, BOOK_ID_B])
  })

  it('forwards spoiler_caps verbatim to the repo as spoilerCaps', async () => {
    const fixture = makeFixture({ chunks: [] })
    const spoilerCaps = { [BOOK_ID_A]: 5 }

    await fixture.tool.execute?.(
      { book_ids: [BOOK_ID_A], aliases: ['Ahab'], spoiler_caps: spoilerCaps },
      {},
    )

    const params = fixture.findCharacterMentions.mock.calls[0]?.[0] as FindCharacterMentionsParams
    expect(params.spoilerCaps).toEqual(spoilerCaps)
  })

  it('applies the default limit of 20 when limit is omitted', async () => {
    const fixture = makeFixture({ chunks: [] })

    await fixture.tool.execute?.({ book_ids: [BOOK_ID_A], aliases: ['Ishmael'] }, {})

    const params = fixture.findCharacterMentions.mock.calls[0]?.[0] as FindCharacterMentionsParams
    expect(params.limit).toBe(FIND_CHARACTER_MENTIONS_DEFAULT_LIMIT)
  })
})

describe('findCharacterMentionsTool — input validation', () => {
  it('rejects an empty aliases array without invoking the repo', async () => {
    const fixture = makeFixture()

    const result = await fixture.tool.execute?.({ book_ids: [BOOK_ID_A], aliases: [] } as never, {})

    expect(result).toBeDefined()
    expect(isValidationError(result)).toBe(true)
    expect(fixture.findCharacterMentions).not.toHaveBeenCalled()
  })

  it('rejects an aliases array with an empty string', async () => {
    const fixture = makeFixture()

    const result = await fixture.tool.execute?.(
      { book_ids: [BOOK_ID_A], aliases: [''] } as never,
      {},
    )

    expect(isValidationError(result)).toBe(true)
    expect(fixture.findCharacterMentions).not.toHaveBeenCalled()
  })

  it('rejects an empty book_ids array', async () => {
    const fixture = makeFixture()

    const result = await fixture.tool.execute?.({ book_ids: [], aliases: ['Ishmael'] } as never, {})

    expect(isValidationError(result)).toBe(true)
    expect(fixture.findCharacterMentions).not.toHaveBeenCalled()
  })

  it('rejects non-UUID book_ids', async () => {
    const fixture = makeFixture()

    const result = await fixture.tool.execute?.(
      { book_ids: ['not-a-uuid'], aliases: ['Ishmael'] } as never,
      {},
    )

    expect(isValidationError(result)).toBe(true)
    expect(fixture.findCharacterMentions).not.toHaveBeenCalled()
  })

  it('rejects limit > 50', async () => {
    const fixture = makeFixture()

    const result = await fixture.tool.execute?.(
      { book_ids: [BOOK_ID_A], aliases: ['Ishmael'], limit: 51 } as never,
      {},
    )

    expect(isValidationError(result)).toBe(true)
    expect(fixture.findCharacterMentions).not.toHaveBeenCalled()
  })
})

describe('findCharacterMentionsTool — edge cases', () => {
  it('returns an empty mentions array when the repo returns no chunks', async () => {
    const fixture = makeFixture({ chunks: [] })

    const result = await fixture.tool.execute?.({ book_ids: [BOOK_ID_A], aliases: ['Nobody'] }, {})

    if (!result || isValidationError(result)) {
      throw new Error('expected a successful tool output')
    }
    expect(result.mentions).toEqual([])
  })
})

describe('findCharacterMentionsTool — error propagation', () => {
  it('rethrows repo errors and logs an error event', async () => {
    const original = new Error('db down')
    const fixture = makeFixture({
      findImpl: async () => {
        throw original
      },
    })

    await expect(
      fixture.tool.execute?.({ book_ids: [BOOK_ID_A], aliases: ['Ishmael'] }, {}),
    ).rejects.toBe(original)
    const errorLog = fixture.logs.find((log) => log.level === 'error')
    expect(errorLog?.meta).toMatchObject({
      tool: FIND_CHARACTER_MENTIONS_TOOL_ID,
      event: 'tool_call',
      book_ids: [BOOK_ID_A],
      alias_count: 1,
    })
  })
})

describe('findCharacterMentionsTool — structured logging', () => {
  it('emits a single info log with monitoring fields after a successful call', async () => {
    const fixture = makeFixture({
      chunks: [
        makeChunk({ chunkId: CHUNK_ID_1, chapterOrdinal: 1 }),
        makeChunk({ chunkId: CHUNK_ID_2, chapterOrdinal: 3 }),
      ],
    })

    await fixture.tool.execute?.(
      {
        book_ids: [BOOK_ID_A, BOOK_ID_B],
        aliases: ['Ishmael', 'narrator'],
        spoiler_caps: { [BOOK_ID_A]: 5 },
        limit: 10,
      },
      {
        agent: {
          agentId: 'dialogus',
          toolCallId: 'tc-1',
          messages: [],
          threadId: 'thread-abc',
          suspend: async () => undefined,
        },
        // biome-ignore lint/suspicious/noExplicitAny: minimal mock shape suffices for this unit test
      } as any,
    )

    const infoLogs = fixture.logs.filter((log) => log.level === 'info')
    expect(infoLogs).toHaveLength(1)
    const meta = infoLogs[0]?.meta ?? {}
    expect(meta).toMatchObject({
      event: 'tool_call',
      tool: FIND_CHARACTER_MENTIONS_TOOL_ID,
      thread_id: 'thread-abc',
      book_ids: [BOOK_ID_A, BOOK_ID_B],
      alias_count: 2,
      returned_count: 2,
    })
    expect(typeof meta.duration_ms).toBe('number')
    expect(meta.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('omits thread_id when no agent context is provided', async () => {
    const fixture = makeFixture({ chunks: [] })

    await fixture.tool.execute?.({ book_ids: [BOOK_ID_A], aliases: ['Ishmael'] }, {})

    const infoLog = fixture.logs.find((log) => log.level === 'info')
    expect(infoLog).toBeDefined()
    expect(infoLog?.meta).toMatchObject({
      tool: FIND_CHARACTER_MENTIONS_TOOL_ID,
      book_ids: [BOOK_ID_A],
      alias_count: 1,
      returned_count: 0,
    })
    expect('thread_id' in (infoLog?.meta ?? {})).toBe(false)
  })
})
