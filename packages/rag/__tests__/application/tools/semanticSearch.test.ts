import { isValidationError } from '@mastra/core/tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SEMANTIC_SEARCH_DEFAULT_K,
  SEMANTIC_SEARCH_EXCERPT_PREVIEW_MAX_LENGTH,
  SEMANTIC_SEARCH_TOOL_DESCRIPTION,
  SEMANTIC_SEARCH_TOOL_ID,
  type SemanticSearchLogger,
  type SemanticSearchToolDeps,
  semanticSearchTool,
} from '../../../src/application/tools/semanticSearch'
import type { ChunkWithContext } from '../../../src/domain/entities/ChunkWithContext'
import { EmbeddingFailedError } from '../../../src/domain/errors/RagError'
import type {
  ChunkReadRepository,
  FindCharacterMentionsParams,
  SearchSemanticParams,
} from '../../../src/domain/ports/ChunkReadRepository.port'
import type { QueryEmbedder } from '../../../src/domain/ports/QueryEmbedder.port'
import { MockQueryEmbedder } from '../../../src/infrastructure/embedding/MockQueryEmbedder'

const BOOK_ID_A = '11111111-1111-4111-8111-111111111111'
const BOOK_ID_B = '22222222-2222-4222-8222-222222222222'
const CHUNK_ID = '33333333-3333-4333-8333-333333333333'
const CHAPTER_ID = '44444444-4444-4444-8444-444444444444'

interface CapturedLog {
  readonly level: 'info' | 'error'
  readonly meta: Record<string, unknown>
  readonly msg: string
}

function makeLogger(): { logger: SemanticSearchLogger; logs: CapturedLog[] } {
  const logs: CapturedLog[] = []
  const logger: SemanticSearchLogger = {
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
    chunkId: CHUNK_ID,
    bookId: BOOK_ID_A,
    chapterId: CHAPTER_ID,
    chapterOrdinal: 1,
    chapterTitle: 'Loomings',
    text: 'Call me Ishmael.',
    excerptPreview: 'Call me Ishmael.',
    score: 0.91,
    ...overrides,
  }
}

function makeChunkRepo(searchSemantic: ChunkReadRepository['searchSemantic']): ChunkReadRepository {
  return {
    searchSemantic,
    findById: vi.fn(),
    findCharacterMentions: vi.fn() as unknown as (
      params: FindCharacterMentionsParams,
    ) => Promise<ChunkWithContext[]>,
  }
}

interface ToolFixture {
  readonly tool: ReturnType<typeof semanticSearchTool>
  readonly deps: SemanticSearchToolDeps
  readonly logs: CapturedLog[]
  readonly searchSemantic: ReturnType<typeof vi.fn>
  readonly embed: ReturnType<typeof vi.fn>
}

interface FixtureOptions {
  readonly chunks?: ChunkWithContext[]
  readonly searchImpl?: (params: SearchSemanticParams) => Promise<ChunkWithContext[]>
  readonly embedImpl?: (query: string) => Promise<number[]>
}

function makeFixture(options: FixtureOptions = {}): ToolFixture {
  const mockEmbedder = new MockQueryEmbedder()
  const embed = vi.fn(async (query: string) => {
    if (options.embedImpl) {
      return options.embedImpl(query)
    }
    return mockEmbedder.embed(query)
  })
  const queryEmbedder: QueryEmbedder = {
    dimensions: 1536,
    modelName: 'mock-query-embedder',
    embed,
  }
  const defaultSearch = async () => options.chunks ?? [makeChunk()]
  const searchSemantic = vi.fn(options.searchImpl ?? defaultSearch)
  const chunkRepo = makeChunkRepo(searchSemantic)
  const { logger, logs } = makeLogger()
  const deps: SemanticSearchToolDeps = { chunkRepo, queryEmbedder, logger }
  const tool = semanticSearchTool(deps)
  return { tool, deps, logs, searchSemantic, embed }
}

beforeEach(() => {
  vi.useRealTimers()
})

describe('semanticSearchTool — metadata', () => {
  it('exposes the canonical id and description', () => {
    const { tool } = makeFixture()
    expect(tool.id).toBe(SEMANTIC_SEARCH_TOOL_ID)
    expect(tool.description).toBe(SEMANTIC_SEARCH_TOOL_DESCRIPTION)
    expect(tool.inputSchema).toBeDefined()
    expect(tool.outputSchema).toBeDefined()
  })
})

describe('semanticSearchTool — happy path', () => {
  it('embeds the query and forwards { bookIds, queryEmbedding, spoilerCaps, k } to the repo', async () => {
    const repoChunks = [
      makeChunk({ chunkId: '55555555-5555-4555-8555-555555555555', score: 0.95 }),
      makeChunk({ chunkId: '66666666-6666-4666-8666-666666666666', score: 0.85 }),
    ]
    const fixture = makeFixture({ chunks: repoChunks })

    const result = await fixture.tool.execute?.(
      { query: 'Ishmael', book_ids: [BOOK_ID_A], k: 5 },
      {},
    )

    expect(result).toBeDefined()
    if (!result || isValidationError(result)) {
      throw new Error('expected a successful tool output')
    }
    expect(result.chunks).toHaveLength(repoChunks.length)
    expect(fixture.embed).toHaveBeenCalledTimes(1)
    expect(fixture.embed).toHaveBeenCalledWith('Ishmael')
    expect(fixture.searchSemantic).toHaveBeenCalledTimes(1)
    const params = fixture.searchSemantic.mock.calls[0]?.[0] as SearchSemanticParams
    expect(params.bookIds).toEqual([BOOK_ID_A])
    expect(params.k).toBe(5)
    expect(params.spoilerCaps).toBeUndefined()
    expect(params.queryEmbedding).toHaveLength(1536)
    expect(
      params.queryEmbedding.every((value) => typeof value === 'number' && Number.isFinite(value)),
    ).toBe(true)
  })
})

describe('semanticSearchTool — output mapping', () => {
  it('converts entity camelCase fields to snake_case DTO keys', async () => {
    const chunk = makeChunk({
      chunkId: '55555555-5555-4555-8555-555555555555',
      bookId: BOOK_ID_A,
      chapterId: CHAPTER_ID,
      chapterOrdinal: 7,
      chapterTitle: 'A Bosom Friend',
      text: 'Better sleep with a sober cannibal than a drunken Christian.',
      excerptPreview: 'Better sleep with a sober cannibal than a drunken Christian.',
      score: 0.73,
    })
    const fixture = makeFixture({ chunks: [chunk] })

    const result = await fixture.tool.execute?.({ query: 'Queequeg', book_ids: [BOOK_ID_A] }, {})

    if (!result || isValidationError(result)) {
      throw new Error('expected a successful tool output')
    }
    const first = result.chunks[0]
    expect(first).toBeDefined()
    expect(first?.chunk_id).toBe(chunk.chunkId)
    expect(first?.book_id).toBe(chunk.bookId)
    expect(first?.chapter_id).toBe(chunk.chapterId)
    expect(first?.chapter_ordinal).toBe(chunk.chapterOrdinal)
    expect(first?.chapter_title).toBe(chunk.chapterTitle)
    expect(first?.text).toBe(chunk.text)
    expect(first?.score).toBe(chunk.score)
    expect(first?.excerpt_preview).toBe(chunk.excerptPreview)
    expect(first as unknown as Record<string, unknown>).not.toHaveProperty('chunkId')
    expect(first as unknown as Record<string, unknown>).not.toHaveProperty('chapterOrdinal')
    expect(first as unknown as Record<string, unknown>).not.toHaveProperty('excerptPreview')
  })

  it('truncates excerpt_preview to 200 characters when source is longer', async () => {
    const longSource = 'a'.repeat(500)
    const chunk = makeChunk({ text: longSource, excerptPreview: longSource })
    const fixture = makeFixture({ chunks: [chunk] })

    const result = await fixture.tool.execute?.({ query: 'irrelevant', book_ids: [BOOK_ID_A] }, {})

    if (!result || isValidationError(result)) {
      throw new Error('expected a successful tool output')
    }
    const first = result.chunks[0]
    expect(first?.text).toBe(longSource)
    expect(first?.excerpt_preview).toHaveLength(SEMANTIC_SEARCH_EXCERPT_PREVIEW_MAX_LENGTH)
    expect(first?.excerpt_preview).toBe(
      longSource.slice(0, SEMANTIC_SEARCH_EXCERPT_PREVIEW_MAX_LENGTH),
    )
  })
})

describe('semanticSearchTool — input forwarding', () => {
  it('forwards spoiler_caps verbatim to the repo as spoilerCaps', async () => {
    const fixture = makeFixture({ chunks: [] })
    const spoilerCaps = { [BOOK_ID_A]: 10 }

    await fixture.tool.execute?.(
      {
        query: 'Ahab',
        book_ids: [BOOK_ID_A],
        spoiler_caps: spoilerCaps,
        k: 5,
      },
      {},
    )

    const params = fixture.searchSemantic.mock.calls[0]?.[0] as SearchSemanticParams
    expect(params.spoilerCaps).toEqual(spoilerCaps)
  })

  it('applies the default top-k of 10 when k is omitted', async () => {
    const fixture = makeFixture({ chunks: [] })

    await fixture.tool.execute?.({ query: 'foo', book_ids: [BOOK_ID_A] }, {})

    const params = fixture.searchSemantic.mock.calls[0]?.[0] as SearchSemanticParams
    expect(params.k).toBe(SEMANTIC_SEARCH_DEFAULT_K)
  })

  it('forwards multi-book search across all provided book ids', async () => {
    const fixture = makeFixture({ chunks: [] })

    await fixture.tool.execute?.({ query: 'comparing', book_ids: [BOOK_ID_A, BOOK_ID_B], k: 7 }, {})

    const params = fixture.searchSemantic.mock.calls[0]?.[0] as SearchSemanticParams
    expect(params.bookIds).toEqual([BOOK_ID_A, BOOK_ID_B])
    expect(params.k).toBe(7)
  })
})

describe('semanticSearchTool — input validation', () => {
  it('rejects an empty query without invoking the embedder or repo', async () => {
    const fixture = makeFixture()

    const result = await fixture.tool.execute?.({ query: '', book_ids: [BOOK_ID_A] } as never, {})

    expect(result).toBeDefined()
    expect(isValidationError(result)).toBe(true)
    expect(fixture.embed).not.toHaveBeenCalled()
    expect(fixture.searchSemantic).not.toHaveBeenCalled()
  })

  it('rejects k > 30', async () => {
    const fixture = makeFixture()

    const result = await fixture.tool.execute?.(
      { query: 'foo', book_ids: [BOOK_ID_A], k: 31 } as never,
      {},
    )

    expect(isValidationError(result)).toBe(true)
    expect(fixture.embed).not.toHaveBeenCalled()
    expect(fixture.searchSemantic).not.toHaveBeenCalled()
  })

  it('rejects non-UUID book_ids', async () => {
    const fixture = makeFixture()

    const result = await fixture.tool.execute?.(
      { query: 'foo', book_ids: ['not-a-uuid'] } as never,
      {},
    )

    expect(isValidationError(result)).toBe(true)
    expect(fixture.embed).not.toHaveBeenCalled()
    expect(fixture.searchSemantic).not.toHaveBeenCalled()
  })

  it('rejects an empty book_ids array', async () => {
    const fixture = makeFixture()

    const result = await fixture.tool.execute?.({ query: 'foo', book_ids: [] } as never, {})

    expect(isValidationError(result)).toBe(true)
    expect(fixture.searchSemantic).not.toHaveBeenCalled()
  })
})

describe('semanticSearchTool — error propagation', () => {
  it('rethrows EmbeddingFailedError as-is without wrapping', async () => {
    const original = new EmbeddingFailedError('boom')
    const fixture = makeFixture({
      embedImpl: async () => {
        throw original
      },
    })

    await expect(fixture.tool.execute?.({ query: 'foo', book_ids: [BOOK_ID_A] }, {})).rejects.toBe(
      original,
    )
    expect(fixture.searchSemantic).not.toHaveBeenCalled()
    const errorLog = fixture.logs.find((log) => log.level === 'error')
    expect(errorLog?.meta).toMatchObject({
      tool: SEMANTIC_SEARCH_TOOL_ID,
      event: 'tool_call',
    })
  })
})

describe('semanticSearchTool — structured logging', () => {
  it('emits a single info log with all monitoring fields after a successful call', async () => {
    const fixture = makeFixture({
      chunks: [
        makeChunk({ chunkId: '55555555-5555-4555-8555-555555555555' }),
        makeChunk({ chunkId: '66666666-6666-4666-8666-666666666666' }),
      ],
    })

    await fixture.tool.execute?.(
      {
        query: 'Ishmael',
        book_ids: [BOOK_ID_A, BOOK_ID_B],
        spoiler_caps: { [BOOK_ID_A]: 5 },
        k: 8,
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
      tool: SEMANTIC_SEARCH_TOOL_ID,
      thread_id: 'thread-abc',
      book_ids: [BOOK_ID_A, BOOK_ID_B],
      spoiler_caps_active: true,
      k: 8,
      returned_count: 2,
    })
    expect(typeof meta.duration_ms).toBe('number')
    expect(meta.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('omits thread_id when no agent context is provided and reports spoiler_caps_active=false', async () => {
    const fixture = makeFixture({ chunks: [] })

    await fixture.tool.execute?.({ query: 'foo', book_ids: [BOOK_ID_A] }, {})

    const infoLog = fixture.logs.find((log) => log.level === 'info')
    expect(infoLog).toBeDefined()
    expect(infoLog?.meta).toMatchObject({
      tool: SEMANTIC_SEARCH_TOOL_ID,
      spoiler_caps_active: false,
      returned_count: 0,
      k: SEMANTIC_SEARCH_DEFAULT_K,
    })
    expect('thread_id' in (infoLog?.meta ?? {})).toBe(false)
  })
})
