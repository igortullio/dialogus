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
import { EmbeddingFailedError } from '../../../src/domain/errors/RagError'
import {
  OPENAI_QUERY_EMBEDDING_DIMENSIONS,
  OPENAI_QUERY_EMBEDDING_MODEL,
  OpenAIQueryEmbedder,
} from '../../../src/infrastructure/embedding/OpenAIQueryEmbedder'

const server = setupServer(...happyPathHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers(...happyPathHandlers))
afterAll(() => server.close())

function makeEmbedder(
  overrides: ConstructorParameters<typeof OpenAIQueryEmbedder>[0] = {},
): OpenAIQueryEmbedder {
  return new OpenAIQueryEmbedder({
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

describe('OpenAIQueryEmbedder — port contract', () => {
  it('exposes dimensions=1536 and modelName="text-embedding-3-small"', () => {
    const embedder = makeEmbedder()
    expect(embedder.dimensions).toBe(1536)
    expect(embedder.modelName).toBe('text-embedding-3-small')
    expect(OPENAI_QUERY_EMBEDDING_DIMENSIONS).toBe(1536)
    expect(OPENAI_QUERY_EMBEDDING_MODEL).toBe('text-embedding-3-small')
  })
})

describe('OpenAIQueryEmbedder.embed — happy path', () => {
  it('returns a 1536-dim numeric vector for a single query', async () => {
    const embedder = makeEmbedder()
    const result = await embedder.embed('hello')
    expect(result).toHaveLength(1536)
    expect(result.every((n) => typeof n === 'number')).toBe(true)
  })

  it('rejects empty queries with EmbeddingFailedError before calling the network', async () => {
    let calls = 0
    server.use(
      http.post(OPENAI_EMBEDDINGS_URL, async ({ request }) => {
        calls += 1
        return embed200Response(request)
      }),
    )
    const embedder = makeEmbedder()
    const error = await embedder.embed('').catch((err) => err)
    expect(error).toBeInstanceOf(EmbeddingFailedError)
    expect(calls).toBe(0)
  })
})

describe('OpenAIQueryEmbedder.embed — 429 retry path', () => {
  it('retries 429 with exponential backoff and succeeds on attempt 2', async () => {
    let calls = 0
    const sleepDurations: number[] = []
    server.use(
      http.post(OPENAI_EMBEDDINGS_URL, async ({ request }) => {
        calls += 1
        if (calls === 1) {
          return embed429Response()
        }
        return embed200Response(request)
      }),
    )

    const embedder = makeEmbedder({
      sleep: async (ms) => {
        sleepDurations.push(ms)
      },
    })
    const result = await embedder.embed('hello')
    expect(calls).toBe(2)
    expect(result).toHaveLength(1536)
    expect(sleepDurations).toEqual([1])
  })

  it('throws EmbeddingFailedError after exhausting 429 retry attempts', async () => {
    let calls = 0
    server.use(
      http.post(OPENAI_EMBEDDINGS_URL, async () => {
        calls += 1
        return embed429Response()
      }),
    )

    const embedder = makeEmbedder()
    const error = await embedder.embed('always 429').catch((err) => err)
    expect(error).toBeInstanceOf(EmbeddingFailedError)
    expect(calls).toBe(3)
  })
})

describe('OpenAIQueryEmbedder.embed — 5xx retry path', () => {
  it('throws EmbeddingFailedError when 500 persists across retry budget', async () => {
    let calls = 0
    server.use(
      http.post(OPENAI_EMBEDDINGS_URL, async () => {
        calls += 1
        return embed500Response()
      }),
    )

    const embedder = makeEmbedder()
    const error = await embedder.embed('always 500').catch((err) => err)
    expect(error).toBeInstanceOf(EmbeddingFailedError)
    expect(calls).toBe(2)
  })

  it('recovers when a 500 is followed by a 200 inside the retry budget', async () => {
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

    const embedder = makeEmbedder()
    const result = await embedder.embed('recovers')
    expect(calls).toBe(2)
    expect(result).toHaveLength(1536)
  })
})
