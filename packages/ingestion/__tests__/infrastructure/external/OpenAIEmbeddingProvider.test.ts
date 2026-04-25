import { http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  embed200Response,
  embed429Response,
  embed500Response,
  happyPathHandlers,
  OPENAI_BASE_URL,
  OPENAI_EMBEDDINGS_URL,
} from '../../../__fixtures__/openai/handlers'
import { EmbedError } from '../../../src/domain/ingestion/IngestionError'
import {
  OPENAI_EMBEDDING_DIMENSIONS,
  OPENAI_EMBEDDING_MODEL,
  OpenAIEmbeddingProvider,
} from '../../../src/infrastructure/external/OpenAIEmbeddingProvider'

const server = setupServer(...happyPathHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers(...happyPathHandlers))
afterAll(() => server.close())

function makeProvider(
  overrides: ConstructorParameters<typeof OpenAIEmbeddingProvider>[0] = {},
): OpenAIEmbeddingProvider {
  return new OpenAIEmbeddingProvider({
    apiKey: 'test-key',
    baseURL: OPENAI_BASE_URL,
    retryBaseDelayMs: 1,
    maxRetryDelayMs: 4,
    sleep: async () => {
      /* no-op for fast tests */
    },
    ...overrides,
  })
}

describe('OpenAIEmbeddingProvider — port contract', () => {
  it('exposes dimensions=1536 and modelName="text-embedding-3-small"', () => {
    const provider = makeProvider()
    expect(provider.dimensions).toBe(1536)
    expect(provider.modelName).toBe('text-embedding-3-small')
    expect(OPENAI_EMBEDDING_DIMENSIONS).toBe(1536)
    expect(OPENAI_EMBEDDING_MODEL).toBe('text-embedding-3-small')
  })
})

describe('OpenAIEmbeddingProvider.embed — happy path', () => {
  it('returns vectors with the correct shape from a 200 response', async () => {
    const provider = makeProvider()
    const result = await provider.embed(['the quick brown fox'])
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(1536)
    expect(result[0]?.every((n) => typeof n === 'number')).toBe(true)
  })

  it('returns one vector per input when batched', async () => {
    const provider = makeProvider()
    const result = await provider.embed(['alpha', 'beta', 'gamma'])
    expect(result).toHaveLength(3)
    for (const vector of result) {
      expect(vector).toHaveLength(1536)
    }
  })

  it('returns an empty array for empty input without making a network call', async () => {
    const provider = makeProvider()
    const result = await provider.embed([])
    expect(result).toEqual([])
  })
})

describe('OpenAIEmbeddingProvider.embed — batch limit', () => {
  it('throws EmbedError (non-retryable) when called with more than 100 inputs', async () => {
    const provider = makeProvider()
    const inputs = Array(101).fill('x')
    const error = await provider.embed(inputs).catch((err) => err)
    expect(error).toBeInstanceOf(EmbedError)
    expect((error as EmbedError).retryable).toBe(false)
  })

  it('accepts exactly 100 inputs without throwing the batch-limit error', async () => {
    const provider = makeProvider()
    const inputs = Array(100).fill('x')
    const result = await provider.embed(inputs)
    expect(result).toHaveLength(100)
  })
})

describe('OpenAIEmbeddingProvider.embed — 429 retry path', () => {
  it('retries 429 with exponential backoff and succeeds on attempt 3', async () => {
    let calls = 0
    const sleepDurations: number[] = []
    server.use(
      http.post(OPENAI_EMBEDDINGS_URL, async ({ request }) => {
        calls += 1
        if (calls < 3) {
          return embed429Response()
        }
        // On attempt 3, return a normal 200 by re-using the happy-path handler.
        return embed200Response(request)
      }),
    )

    const provider = makeProvider({
      sleep: async (ms) => {
        sleepDurations.push(ms)
      },
    })
    const result = await provider.embed(['retry text'])
    expect(calls).toBe(3)
    expect(result).toHaveLength(1)
    expect(sleepDurations).toEqual([1, 2])
  })

  it('throws EmbedError with retryable=true after 3 failed 429 attempts', async () => {
    let calls = 0
    server.use(
      http.post(OPENAI_EMBEDDINGS_URL, async () => {
        calls += 1
        return embed429Response()
      }),
    )

    const provider = makeProvider()
    const error = await provider.embed(['always 429']).catch((err) => err)
    expect(error).toBeInstanceOf(EmbedError)
    expect((error as EmbedError).retryable).toBe(true)
    expect(calls).toBe(3)
  })
})

describe('OpenAIEmbeddingProvider.embed — 5xx retry path', () => {
  it('retries 5xx once and surfaces EmbedError after 2 attempts', async () => {
    let calls = 0
    server.use(
      http.post(OPENAI_EMBEDDINGS_URL, async () => {
        calls += 1
        return embed500Response()
      }),
    )

    const provider = makeProvider()
    const error = await provider.embed(['always 500']).catch((err) => err)
    expect(error).toBeInstanceOf(EmbedError)
    expect((error as EmbedError).retryable).toBe(true)
    expect(calls).toBe(2)
  })

  it('recovers when 5xx is followed by a 200 within the retry budget', async () => {
    let calls = 0
    server.use(
      http.post(OPENAI_EMBEDDINGS_URL, async ({ request }) => {
        calls += 1
        if (calls === 1) {
          return embed500Response()
        }
        return embed200Response(request)
      }),
    )

    const provider = makeProvider()
    const result = await provider.embed(['recovers'])
    expect(calls).toBe(2)
    expect(result).toHaveLength(1)
  })
})
