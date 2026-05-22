import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOpenAI } from '@ai-sdk/openai'
import Bottleneck from 'bottleneck'
import { getEncoding, type Tiktoken } from 'js-tiktoken'
import type {
  ChapterSummaryGeneration,
  ChapterSummaryGenerator,
} from '../../domain/chapter_summary/ChapterSummaryGenerator.port'
import { SummarizeError } from '../../domain/ingestion/IngestionError'
import type { ParsedChapter, SupportedLanguage } from '../../domain/parser/ChapterParser.port'

export const OPENAI_SUMMARY_MODEL = 'gpt-4o-mini'

const TOKEN_ENCODING = 'cl100k_base' as const
const DEFAULT_LIMITER_OPTIONS: ConstructorParameters<typeof Bottleneck>[0] = {
  // OpenAI tier 1 allows 500 RPM and 200k TPM on gpt-4o-mini. With long
  // chapters (~5-8k tokens each), 40 RPM × 8k tokens = 320k TPM — over the
  // ceiling. Pacing at 4s/call (15 RPM × 8k = 120k TPM) leaves ~40 % headroom
  // and finishes a 100-chapter book in ~7 minutes.
  maxConcurrent: 1,
  minTime: 4000,
}
const DEFAULT_RATE_LIMIT_ATTEMPTS = 8
const DEFAULT_SERVER_ERROR_ATTEMPTS = 3
const DEFAULT_RETRY_BASE_DELAY_MS = 500
// OpenAI's 429 carries either `retry-after` (seconds) or `retry-after-ms`
// (often very short, like 200ms for TPM bucket nudges). We honour the server
// hint but floor it so we don't burn all attempts in a few hundred
// milliseconds before the bucket actually refills.
const DEFAULT_RETRY_MAX_DELAY_MS = 90_000
const RATE_LIMIT_RETRY_FLOOR_MS = 8_000

const here = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PROMPT_PATH = join(here, '..', 'prompts', 'summarize.md')

export interface OpenAIChapterSummaryGeneratorOptions {
  readonly apiKey?: string
  readonly baseURL?: string
  readonly headers?: Record<string, string>
  readonly fetchImpl?: typeof fetch
  readonly limiterOptions?: ConstructorParameters<typeof Bottleneck>[0]
  readonly rateLimitAttempts?: number
  readonly serverErrorAttempts?: number
  readonly retryBaseDelayMs?: number
  readonly maxRetryDelayMs?: number
  readonly sleep?: (ms: number) => Promise<void>
  readonly promptPath?: string
  readonly model?: string
}

type OpenAILanguageModel = ReturnType<ReturnType<typeof createOpenAI>>

interface TextContentPart {
  readonly type: 'text'
  readonly text: string
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class OpenAIChapterSummaryGenerator implements ChapterSummaryGenerator {
  private readonly model: OpenAILanguageModel
  private readonly modelName: string
  private readonly limiter: Bottleneck
  private readonly rateLimitAttempts: number
  private readonly serverErrorAttempts: number
  private readonly retryBaseDelayMs: number
  private readonly maxRetryDelayMs: number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly systemPrompt: string
  private readonly tokenizer: Tiktoken

  constructor(options: OpenAIChapterSummaryGeneratorOptions = {}) {
    const provider = createOpenAI({
      apiKey: options.apiKey ?? process.env.OPENAI_API_KEY ?? 'test',
      baseURL: options.baseURL,
      headers: options.headers,
      fetch: options.fetchImpl,
    })
    this.modelName = options.model ?? OPENAI_SUMMARY_MODEL
    this.model = provider(this.modelName)
    this.limiter = new Bottleneck(options.limiterOptions ?? DEFAULT_LIMITER_OPTIONS)
    this.rateLimitAttempts = options.rateLimitAttempts ?? DEFAULT_RATE_LIMIT_ATTEMPTS
    this.serverErrorAttempts = options.serverErrorAttempts ?? DEFAULT_SERVER_ERROR_ATTEMPTS
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS
    this.sleep = options.sleep ?? defaultSleep
    this.systemPrompt = readFileSync(options.promptPath ?? DEFAULT_PROMPT_PATH, 'utf8')
    this.tokenizer = getEncoding(TOKEN_ENCODING)
  }

  async generate(
    chapter: ParsedChapter,
    language: SupportedLanguage,
  ): Promise<ChapterSummaryGeneration> {
    return this.limiter.schedule(() => this.callWithRetry(chapter, language))
  }

  private async callWithRetry(
    chapter: ParsedChapter,
    language: SupportedLanguage,
  ): Promise<ChapterSummaryGeneration> {
    let attempt = 1
    let lastError: unknown = null
    while (true) {
      try {
        return await this.invokeModel(chapter, language)
      } catch (error) {
        lastError = error
        const status = extractStatusCode(error)
        const maxAttempts = this.maxAttemptsFor(status)
        if (maxAttempts === null) {
          throw new SummarizeError(`OpenAI summary generation failed: ${describeError(error)}`, {
            cause: error,
            retryable: false,
          })
        }
        if (attempt >= maxAttempts) {
          throw new SummarizeError(
            `OpenAI summary generation failed after ${attempt} attempt(s) with HTTP ${status ?? 'unknown'}`,
            { cause: lastError, retryable: true },
          )
        }
        const delay = this.computeRetryDelay(error, status, attempt)
        await this.sleep(delay)
        attempt += 1
      }
    }
  }

  private computeRetryDelay(error: unknown, status: number | undefined, attempt: number): number {
    if (status === 429) {
      const retryAfterMs = extractRetryAfterMs(error)
      if (retryAfterMs !== null) {
        // Floor the server-suggested wait. OpenAI's TPM-bucket 429s often
        // come with `retry-after-ms: 200`, but the bucket actually needs
        // several seconds to refill enough for the next call. Sleeping the
        // raw value burns all attempts in a flash.
        return Math.min(Math.max(retryAfterMs, RATE_LIMIT_RETRY_FLOOR_MS), this.maxRetryDelayMs)
      }
      return Math.min(RATE_LIMIT_RETRY_FLOOR_MS, this.maxRetryDelayMs)
    }
    return Math.min(this.retryBaseDelayMs * 2 ** (attempt - 1), this.maxRetryDelayMs)
  }

  private async invokeModel(
    chapter: ParsedChapter,
    language: SupportedLanguage,
  ): Promise<ChapterSummaryGeneration> {
    const result = await this.model.doGenerate({
      prompt: [
        { role: 'system', content: this.systemPrompt },
        {
          role: 'user',
          content: [{ type: 'text', text: buildUserPrompt(chapter, language) }],
        },
      ],
    })
    const summary = extractSummaryText(result.content).trim()
    if (summary.length === 0) {
      throw new SummarizeError('OpenAI returned an empty summary', { retryable: false })
    }
    const tokenCount = this.tokenizer.encode(summary).length
    return { summary, tokenCount, model: this.modelName }
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

function buildUserPrompt(chapter: ParsedChapter, language: SupportedLanguage): string {
  return [
    `Language: ${language}`,
    `Chapter ordinal: ${chapter.ordinal}`,
    `Chapter title: ${chapter.title}`,
    '',
    'Chapter text:',
    chapter.plainText,
  ].join('\n')
}

function extractSummaryText(content: ReadonlyArray<unknown>): string {
  const parts: string[] = []
  for (const part of content) {
    if (isTextContentPart(part)) {
      parts.push(part.text)
    }
  }
  return parts.join('')
}

function isTextContentPart(part: unknown): part is TextContentPart {
  if (typeof part !== 'object' || part === null) {
    return false
  }
  const candidate = part as { type?: unknown; text?: unknown }
  return candidate.type === 'text' && typeof candidate.text === 'string'
}

function extractStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }
  const candidate = (error as { statusCode?: unknown }).statusCode
  return typeof candidate === 'number' ? candidate : undefined
}

function extractRetryAfterMs(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const headers = (error as { responseHeaders?: unknown }).responseHeaders
  if (typeof headers !== 'object' || headers === null) return null
  const map = headers as Record<string, unknown>
  const ms = map['retry-after-ms']
  if (typeof ms === 'string') {
    const parsed = Number.parseInt(ms, 10)
    if (!Number.isNaN(parsed) && parsed > 0) return parsed + Math.floor(Math.random() * 500)
  }
  const seconds = map['retry-after']
  if (typeof seconds === 'string') {
    const parsed = Number.parseInt(seconds, 10)
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed * 1000 + Math.floor(Math.random() * 1000)
    }
  }
  return null
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
