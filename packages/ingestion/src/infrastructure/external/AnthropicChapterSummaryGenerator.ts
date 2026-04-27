import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAnthropic } from '@ai-sdk/anthropic'
import Bottleneck from 'bottleneck'
import { getEncoding, type Tiktoken } from 'js-tiktoken'
import type {
  ChapterSummaryGeneration,
  ChapterSummaryGenerator,
} from '../../domain/chapter_summary/ChapterSummaryGenerator.port'
import { SummarizeError } from '../../domain/ingestion/IngestionError'
import type { ParsedChapter, SupportedLanguage } from '../../domain/parser/ChapterParser.port'

export const ANTHROPIC_SUMMARY_MODEL = 'claude-haiku-4-5'

const TOKEN_ENCODING = 'cl100k_base' as const
const DEFAULT_LIMITER_OPTIONS: ConstructorParameters<typeof Bottleneck>[0] = {
  maxConcurrent: 1,
  minTime: 2000,
}
const DEFAULT_RATE_LIMIT_ATTEMPTS = 3
const DEFAULT_SERVER_ERROR_ATTEMPTS = 3
const DEFAULT_RETRY_BASE_DELAY_MS = 500
const DEFAULT_RETRY_MAX_DELAY_MS = 8000

const here = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PROMPT_PATH = join(here, '..', 'prompts', 'summarize.md')

export interface AnthropicChapterSummaryGeneratorOptions {
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
}

type AnthropicLanguageModel = ReturnType<ReturnType<typeof createAnthropic>>

interface TextContentPart {
  readonly type: 'text'
  readonly text: string
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class AnthropicChapterSummaryGenerator implements ChapterSummaryGenerator {
  private readonly model: AnthropicLanguageModel
  private readonly limiter: Bottleneck
  private readonly rateLimitAttempts: number
  private readonly serverErrorAttempts: number
  private readonly retryBaseDelayMs: number
  private readonly maxRetryDelayMs: number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly systemPrompt: string
  private readonly tokenizer: Tiktoken

  constructor(options: AnthropicChapterSummaryGeneratorOptions = {}) {
    const provider = createAnthropic({
      apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? 'test',
      baseURL: options.baseURL,
      headers: options.headers,
      fetch: options.fetchImpl,
    })
    this.model = provider(ANTHROPIC_SUMMARY_MODEL)
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
          throw new SummarizeError(`Anthropic summary generation failed: ${describeError(error)}`, {
            cause: error,
            retryable: false,
          })
        }
        if (attempt >= maxAttempts) {
          throw new SummarizeError(
            `Anthropic summary generation failed after ${attempt} attempt(s) with HTTP ${status ?? 'unknown'}`,
            { cause: lastError, retryable: true },
          )
        }
        const delay = Math.min(this.retryBaseDelayMs * 2 ** (attempt - 1), this.maxRetryDelayMs)
        await this.sleep(delay)
        attempt += 1
      }
    }
  }

  private async invokeModel(
    chapter: ParsedChapter,
    language: SupportedLanguage,
  ): Promise<ChapterSummaryGeneration> {
    const result = await this.model.doGenerate({
      prompt: [
        {
          role: 'system',
          content: this.systemPrompt,
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
        {
          role: 'user',
          content: [{ type: 'text', text: buildUserPrompt(chapter, language) }],
        },
      ],
    })
    const summary = extractSummaryText(result.content).trim()
    if (summary.length === 0) {
      throw new SummarizeError('Anthropic returned an empty summary', { retryable: false })
    }
    const tokenCount = this.tokenizer.encode(summary).length
    return { summary, tokenCount, model: ANTHROPIC_SUMMARY_MODEL }
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

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
