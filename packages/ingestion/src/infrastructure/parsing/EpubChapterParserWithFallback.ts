import { ParseError } from '../../domain/ingestion/IngestionError'
import type {
  ChapterParser,
  ParsedChapter,
  SupportedLanguage,
} from '../../domain/parser/ChapterParser.port'

export interface FallbackLogger {
  warn(message: string, meta?: Record<string, unknown>): void
}

const noopLogger: FallbackLogger = {
  warn() {
    /* swallow */
  },
}

export interface EpubChapterParserWithFallbackOptions {
  readonly primary: ChapterParser
  readonly fallback: ChapterParser
  readonly logger?: FallbackLogger
}

export class EpubChapterParserWithFallback implements ChapterParser {
  private readonly primary: ChapterParser
  private readonly fallback: ChapterParser
  private readonly logger: FallbackLogger

  constructor(options: EpubChapterParserWithFallbackOptions) {
    this.primary = options.primary
    this.fallback = options.fallback
    this.logger = options.logger ?? noopLogger
  }

  async *parse(rawFilePath: string, language: SupportedLanguage): AsyncIterable<ParsedChapter> {
    let yielded = 0
    let primaryError: unknown = null
    try {
      for await (const chapter of this.primary.parse(rawFilePath, language)) {
        yielded += 1
        yield chapter
      }
    } catch (error) {
      primaryError = error
    }
    if (primaryError === null) return
    if (yielded > 0) {
      throw new ParseError(
        `EpubChapterParserWithFallback: primary parser failed for ${rawFilePath} after yielding ${yielded} chapter(s); cannot safely fall back`,
        { cause: primaryError },
      )
    }
    this.logger.warn('EpubChapterParser primary failed; falling back to epub2', {
      rawFilePath,
      error: describeError(primaryError),
    })
    try {
      for await (const chapter of this.fallback.parse(rawFilePath, language)) {
        yield chapter
      }
    } catch (fallbackError) {
      throw new ParseError(
        `EpubChapterParserWithFallback: both parsers failed for ${rawFilePath}`,
        { cause: { primary: primaryError, fallback: fallbackError } },
      )
    }
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
