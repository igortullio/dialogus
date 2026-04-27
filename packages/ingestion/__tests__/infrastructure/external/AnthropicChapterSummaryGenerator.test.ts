import { http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  ANTHROPIC_BASE_URL,
  ANTHROPIC_MESSAGES_URL,
  anthropic200Response,
  anthropic429Response,
  anthropic500Response,
  buildAnthropicSuccessBody,
  happyPathHandlers,
} from '../../../__fixtures__/anthropic/handlers'
import { SummarizeError } from '../../../src/domain/ingestion/IngestionError'
import type { ParsedChapter } from '../../../src/domain/parser/ChapterParser.port'
import {
  ANTHROPIC_SUMMARY_MODEL,
  AnthropicChapterSummaryGenerator,
} from '../../../src/infrastructure/external/AnthropicChapterSummaryGenerator'

const server = setupServer(...happyPathHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers(...happyPathHandlers))
afterAll(() => server.close())

function makeGenerator(
  overrides: ConstructorParameters<typeof AnthropicChapterSummaryGenerator>[0] = {},
): AnthropicChapterSummaryGenerator {
  return new AnthropicChapterSummaryGenerator({
    apiKey: 'test-key',
    baseURL: ANTHROPIC_BASE_URL,
    limiterOptions: { maxConcurrent: 1, minTime: 0 },
    retryBaseDelayMs: 1,
    maxRetryDelayMs: 4,
    sleep: async () => {
      /* fast tests */
    },
    ...overrides,
  })
}

function makeChapter(overrides: Partial<ParsedChapter> = {}): ParsedChapter {
  return {
    ordinal: 1,
    title: 'Loomings',
    plainText: 'Call me Ishmael. Some years ago—never mind how long precisely...',
    tokenCount: 12,
    ...overrides,
  }
}

describe('AnthropicChapterSummaryGenerator — happy path', () => {
  it('returns { summary, tokenCount, model } for an English chapter', async () => {
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async () =>
        anthropic200Response({ text: 'A scholarly summary in English of the chapter.' }),
      ),
    )
    const generator = makeGenerator()
    const result = await generator.generate(makeChapter(), 'en')
    expect(result.summary).toBe('A scholarly summary in English of the chapter.')
    expect(result.model).toBe(ANTHROPIC_SUMMARY_MODEL)
    expect(result.tokenCount).toBeGreaterThan(0)
  })

  it('returns { summary, tokenCount, model } for a Portuguese chapter', async () => {
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async () =>
        anthropic200Response({ text: 'Um resumo erudito em português do capítulo.' }),
      ),
    )
    const generator = makeGenerator()
    const chapter = makeChapter({ title: 'Capítulo Primeiro', plainText: 'Era uma vez...' })
    const result = await generator.generate(chapter, 'pt')
    expect(result.summary).toBe('Um resumo erudito em português do capítulo.')
    expect(result.model).toBe(ANTHROPIC_SUMMARY_MODEL)
  })

  it('counts summary tokens via cl100k_base on the trimmed summary text', async () => {
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async () =>
        anthropic200Response({ text: '   trimmed summary text   ' }),
      ),
    )
    const generator = makeGenerator()
    const result = await generator.generate(makeChapter(), 'en')
    expect(result.summary).toBe('trimmed summary text')
    expect(result.tokenCount).toBeGreaterThan(0)
    expect(result.tokenCount).toBeLessThan(20)
  })

  it('sends a system message with cache_control: ephemeral on the system block', async () => {
    let capturedBody: unknown = null
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
        capturedBody = await request.json()
        return anthropic200Response()
      }),
    )
    const generator = makeGenerator()
    await generator.generate(makeChapter(), 'en')
    const body = capturedBody as {
      readonly model: string
      readonly system: ReadonlyArray<Record<string, unknown>>
    }
    expect(body.model).toBe(ANTHROPIC_SUMMARY_MODEL)
    expect(Array.isArray(body.system)).toBe(true)
    const firstSystemBlock = body.system[0] as { cache_control?: { type: string } }
    expect(firstSystemBlock?.cache_control).toEqual({ type: 'ephemeral' })
  })
})

describe('AnthropicChapterSummaryGenerator — retry behavior', () => {
  it('succeeds without throwing when 429 fires twice before a 200', async () => {
    let calls = 0
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async () => {
        calls += 1
        if (calls < 3) {
          return anthropic429Response()
        }
        return anthropic200Response({ text: 'recovered after retries' })
      }),
    )
    const generator = makeGenerator({ rateLimitAttempts: 3 })
    const result = await generator.generate(makeChapter(), 'en')
    expect(calls).toBe(3)
    expect(result.summary).toBe('recovered after retries')
  })

  it('throws SummarizeError with retryable=true after persistent 500', async () => {
    let calls = 0
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async () => {
        calls += 1
        return anthropic500Response()
      }),
    )
    const generator = makeGenerator({ serverErrorAttempts: 2 })
    const error = await generator.generate(makeChapter(), 'en').catch((err) => err)
    expect(error).toBeInstanceOf(SummarizeError)
    expect((error as SummarizeError).retryable).toBe(true)
    expect(calls).toBe(2)
  })

  it('throws SummarizeError with retryable=true after persistent 429', async () => {
    server.use(http.post(ANTHROPIC_MESSAGES_URL, async () => anthropic429Response()))
    const generator = makeGenerator({ rateLimitAttempts: 2 })
    const error = await generator.generate(makeChapter(), 'en').catch((err) => err)
    expect(error).toBeInstanceOf(SummarizeError)
    expect((error as SummarizeError).retryable).toBe(true)
  })
})

describe('AnthropicChapterSummaryGenerator — rate limiter', () => {
  it('serializes concurrent calls when limiter is configured (verifies bottleneck spacing)', async () => {
    server.use(http.post(ANTHROPIC_MESSAGES_URL, async () => anthropic200Response()))
    const generator = makeGenerator({
      limiterOptions: { maxConcurrent: 1, minTime: 100 },
    })
    const start = Date.now()
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        generator.generate(makeChapter({ ordinal: i, title: `Chapter ${i}` }), 'en'),
      ),
    )
    const duration = Date.now() - start
    expect(duration).toBeGreaterThanOrEqual(4 * 100)
  }, 5_000)

  it('default limiter enforces 30 RPM (≥ 2 s between successive calls)', async () => {
    server.use(http.post(ANTHROPIC_MESSAGES_URL, async () => anthropic200Response()))
    const generator = new AnthropicChapterSummaryGenerator({
      apiKey: 'test-key',
      baseURL: ANTHROPIC_BASE_URL,
    })
    const start = Date.now()
    await Promise.all([
      generator.generate(makeChapter({ ordinal: 1, title: 'A' }), 'en'),
      generator.generate(makeChapter({ ordinal: 2, title: 'B' }), 'en'),
    ])
    const duration = Date.now() - start
    expect(duration).toBeGreaterThanOrEqual(2000)
  }, 10_000)
})

describe('AnthropicChapterSummaryGenerator — fixture builder', () => {
  it('exposes a buildAnthropicSuccessBody fixture builder for downstream tests', () => {
    const body = buildAnthropicSuccessBody({ text: 'hello' })
    expect(body).toMatchObject({
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-4-5',
    })
    const content = (body.content as Array<{ type: string; text: string }>) ?? []
    expect(content[0]?.text).toBe('hello')
  })
})
