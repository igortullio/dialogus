import { http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  happyPathHandlers,
  OPENAI_CHAT_BASE_URL,
  OPENAI_CHAT_COMPLETIONS_URL,
  OPENAI_RESPONSES_URL,
  openaiChat200Response,
  openaiChat429Response,
  openaiChat500Response,
  openaiResponses200Response,
  openaiResponses429Response,
  openaiResponses500Response,
} from '../../../__fixtures__/openai/chat-handlers'
import { SummarizeError } from '../../../src/domain/ingestion/IngestionError'
import type { ParsedChapter } from '../../../src/domain/parser/ChapterParser.port'
import {
  OPENAI_SUMMARY_MODEL,
  OpenAIChapterSummaryGenerator,
} from '../../../src/infrastructure/external/OpenAIChapterSummaryGenerator'

const server = setupServer(...happyPathHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers(...happyPathHandlers))
afterAll(() => server.close())

function makeGenerator(
  overrides: ConstructorParameters<typeof OpenAIChapterSummaryGenerator>[0] = {},
): OpenAIChapterSummaryGenerator {
  return new OpenAIChapterSummaryGenerator({
    apiKey: 'test-key',
    baseURL: OPENAI_CHAT_BASE_URL,
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

function bothEndpoints(text: string) {
  return [
    http.post(OPENAI_CHAT_COMPLETIONS_URL, async () => openaiChat200Response({ text })),
    http.post(OPENAI_RESPONSES_URL, async () => openaiResponses200Response({ text })),
  ]
}

describe('OpenAIChapterSummaryGenerator — happy path', () => {
  it('returns { summary, tokenCount, model } for an English chapter', async () => {
    server.use(...bothEndpoints('A scholarly summary in English of the chapter.'))
    const generator = makeGenerator()
    const result = await generator.generate(makeChapter(), 'en')
    expect(result.summary).toBe('A scholarly summary in English of the chapter.')
    expect(result.model).toBe(OPENAI_SUMMARY_MODEL)
    expect(result.tokenCount).toBeGreaterThan(0)
  })

  it('returns { summary, tokenCount, model } for a Portuguese chapter', async () => {
    server.use(...bothEndpoints('Um resumo erudito em português do capítulo.'))
    const generator = makeGenerator()
    const chapter = makeChapter({ title: 'Capítulo Primeiro', plainText: 'Era uma vez...' })
    const result = await generator.generate(chapter, 'pt')
    expect(result.summary).toBe('Um resumo erudito em português do capítulo.')
    expect(result.model).toBe(OPENAI_SUMMARY_MODEL)
  })

  it('counts summary tokens via cl100k_base on the trimmed summary text', async () => {
    server.use(...bothEndpoints('   trimmed summary text   '))
    const generator = makeGenerator()
    const result = await generator.generate(makeChapter(), 'en')
    expect(result.summary).toBe('trimmed summary text')
    expect(result.tokenCount).toBeGreaterThan(0)
    expect(result.tokenCount).toBeLessThan(20)
  })

  it('honours a custom model name', async () => {
    server.use(...bothEndpoints('any text'))
    const generator = makeGenerator({ model: 'gpt-4o' })
    const result = await generator.generate(makeChapter(), 'en')
    expect(result.model).toBe('gpt-4o')
  })
})

describe('OpenAIChapterSummaryGenerator — retry behavior', () => {
  it('throws SummarizeError with retryable=true after persistent 500', async () => {
    server.use(
      http.post(OPENAI_CHAT_COMPLETIONS_URL, async () => openaiChat500Response()),
      http.post(OPENAI_RESPONSES_URL, async () => openaiResponses500Response()),
    )
    const generator = makeGenerator({ serverErrorAttempts: 2 })
    let error: unknown
    try {
      await generator.generate(makeChapter(), 'en')
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(SummarizeError)
    expect((error as SummarizeError).retryable).toBe(true)
  })

  it('throws SummarizeError with retryable=true after persistent 429', async () => {
    server.use(
      http.post(OPENAI_CHAT_COMPLETIONS_URL, async () => openaiChat429Response()),
      http.post(OPENAI_RESPONSES_URL, async () => openaiResponses429Response()),
    )
    const generator = makeGenerator({ rateLimitAttempts: 2 })
    let error: unknown
    try {
      await generator.generate(makeChapter(), 'en')
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(SummarizeError)
    expect((error as SummarizeError).retryable).toBe(true)
  })

  it('floors short retry-after on 429 to avoid burning attempts in milliseconds', async () => {
    let callCount = 0
    server.use(
      http.post(OPENAI_CHAT_COMPLETIONS_URL, async () => {
        callCount += 1
        if (callCount === 1) return openaiChat429Response(2)
        return openaiChat200Response({ text: 'ok' })
      }),
      http.post(OPENAI_RESPONSES_URL, async () => {
        callCount += 1
        if (callCount === 1) return openaiResponses429Response(2)
        return openaiResponses200Response({ text: 'ok' })
      }),
    )
    const sleepCalls: number[] = []
    const generator = makeGenerator({
      rateLimitAttempts: 3,
      retryBaseDelayMs: 1,
      maxRetryDelayMs: 60_000,
      sleep: async (ms) => {
        sleepCalls.push(ms)
      },
    })
    const result = await generator.generate(makeChapter(), 'en')
    expect(result.summary).toBe('ok')
    expect(sleepCalls.length).toBeGreaterThan(0)
    // Server says 2s, but we floor to 8s so the TPM bucket actually refills.
    expect(sleepCalls[0]).toBeGreaterThanOrEqual(8000)
    expect(sleepCalls[0]).toBeLessThanOrEqual(60_000)
  })

  it('does not retry on non-retryable client errors (e.g. 400)', async () => {
    server.use(
      http.post(
        OPENAI_CHAT_COMPLETIONS_URL,
        async () => openaiChat200Response({ text: '' }), // empty → SummarizeError non-retryable
      ),
      http.post(OPENAI_RESPONSES_URL, async () => openaiResponses200Response({ text: '' })),
    )
    const generator = makeGenerator()
    let error: unknown
    try {
      await generator.generate(makeChapter(), 'en')
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(SummarizeError)
    expect((error as SummarizeError).retryable).toBe(false)
  })
})
