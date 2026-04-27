import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai'
import { EmbeddingFailedError } from '../../domain/errors/RagError'
import type { QueryEmbedder } from '../../domain/ports/QueryEmbedder.port'

export const OPENAI_QUERY_EMBEDDING_MODEL = 'text-embedding-3-small'
export const OPENAI_QUERY_EMBEDDING_DIMENSIONS = 1536

const DEFAULT_RATE_LIMIT_ATTEMPTS = 3
const DEFAULT_SERVER_ERROR_ATTEMPTS = 2
const DEFAULT_RETRY_BASE_DELAY_MS = 1000
const DEFAULT_RETRY_MAX_DELAY_MS = 8000

export interface OpenAIQueryEmbedderOptions {
  readonly apiKey?: string
  readonly baseURL?: string
  readonly fetchImpl?: typeof globalThis.fetch
  readonly headers?: Record<string, string>
  readonly rateLimitAttempts?: number
  readonly serverErrorAttempts?: number
  readonly retryBaseDelayMs?: number
  readonly maxRetryDelayMs?: number
  readonly sleep?: (ms: number) => Promise<void>
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type EmbeddingModel = ReturnType<OpenAIProvider['embedding']>

export class OpenAIQueryEmbedder implements QueryEmbedder {
  readonly dimensions = 1536 as const
  readonly modelName = OPENAI_QUERY_EMBEDDING_MODEL

  private readonly model: EmbeddingModel
  private readonly rateLimitAttempts: number
  private readonly serverErrorAttempts: number
  private readonly retryBaseDelayMs: number
  private readonly maxRetryDelayMs: number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: OpenAIQueryEmbedderOptions = {}) {
    const provider = createOpenAI({
      apiKey: options.apiKey ?? process.env.OPENAI_API_KEY ?? 'test',
      baseURL: options.baseURL,
      headers: options.headers,
      fetch: options.fetchImpl,
    })
    this.model = provider.embedding(OPENAI_QUERY_EMBEDDING_MODEL)
    this.rateLimitAttempts = options.rateLimitAttempts ?? DEFAULT_RATE_LIMIT_ATTEMPTS
    this.serverErrorAttempts = options.serverErrorAttempts ?? DEFAULT_SERVER_ERROR_ATTEMPTS
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS
    this.sleep = options.sleep ?? defaultSleep
  }

  async embed(query: string): Promise<number[]> {
    if (query.length === 0) {
      throw new EmbeddingFailedError('Query must not be empty')
    }
    let attempt = 1
    while (true) {
      try {
        const result = await this.model.doEmbed({ values: [query] })
        const first = result.embeddings[0]
        if (!first) {
          throw new EmbeddingFailedError('OpenAI query embedding returned no vectors')
        }
        return [...first]
      } catch (error) {
        attempt = await this.handleAttemptFailure(error, attempt)
      }
    }
  }

  private async handleAttemptFailure(error: unknown, attempt: number): Promise<number> {
    if (error instanceof EmbeddingFailedError) {
      throw error
    }
    const status = extractStatusCode(error)
    const maxAttempts = this.maxAttemptsFor(status)
    if (maxAttempts === null) {
      throw new EmbeddingFailedError(`OpenAI query embedding failed: ${describeError(error)}`, {
        cause: error,
      })
    }
    if (attempt >= maxAttempts) {
      throw new EmbeddingFailedError(
        `OpenAI query embedding failed after ${attempt} attempt(s) with HTTP ${status ?? 'unknown'}`,
        { cause: error },
      )
    }
    const delay = Math.min(this.retryBaseDelayMs * 2 ** (attempt - 1), this.maxRetryDelayMs)
    await this.sleep(delay)
    return attempt + 1
  }

  private maxAttemptsFor(status: number | undefined): number | null {
    if (status === 429) {
      return this.rateLimitAttempts
    }
    if (status !== undefined && status >= 500 && status < 600) {
      return this.serverErrorAttempts
    }
    return null
  }
}

function extractStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }
  const candidate = (error as { statusCode?: unknown }).statusCode
  return typeof candidate === 'number' ? candidate : undefined
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
