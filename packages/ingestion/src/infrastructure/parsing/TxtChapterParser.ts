import { createReadStream, type ReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { getEncoding, type Tiktoken } from 'js-tiktoken'
import { ParseError } from '../../domain/ingestion/IngestionError'
import type {
  ChapterParser,
  ParsedChapter,
  SupportedLanguage,
} from '../../domain/parser/ChapterParser.port'
import {
  type ChapterHeuristicsConfig,
  type LanguageHeuristics,
  loadChapterHeuristics,
} from './chapter-heuristics'

const TOKEN_ENCODING = 'cl100k_base' as const

export interface TxtChapterParserOptions {
  readonly heuristics?: ChapterHeuristicsConfig
  readonly tokenizer?: Tiktoken
}

interface BufferedChapter {
  title: string
  bodyLines: string[]
}

export class TxtChapterParser implements ChapterParser {
  private readonly heuristics: ChapterHeuristicsConfig
  private readonly tokenizer: Tiktoken

  constructor(options: TxtChapterParserOptions = {}) {
    this.heuristics = options.heuristics ?? loadChapterHeuristics()
    this.tokenizer = options.tokenizer ?? getEncoding(TOKEN_ENCODING)
  }

  async *parse(rawFilePath: string, language: SupportedLanguage): AsyncIterable<ParsedChapter> {
    const langConfig: LanguageHeuristics = this.heuristics[language]
    let stream: ReadStream | null = null
    try {
      stream = createReadStream(rawFilePath, { encoding: 'utf8' })
      const rl = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY })

      let ordinal = 0
      let current: BufferedChapter | null = null
      let sawAnyHeader = false
      const fallbackBody: string[] = []

      for await (const line of rl) {
        if (matchesAny(line, langConfig.patterns)) {
          if (current) {
            ordinal += 1
            yield this.buildChapter(ordinal, current)
          }
          current = { title: line.trim(), bodyLines: [] }
          sawAnyHeader = true
          fallbackBody.length = 0
          continue
        }
        if (current) {
          current.bodyLines.push(line)
        } else if (!sawAnyHeader) {
          fallbackBody.push(line)
        }
      }

      if (current) {
        ordinal += 1
        yield this.buildChapter(ordinal, current)
        return
      }

      yield this.buildChapter(1, {
        title: langConfig.fallbackTitle,
        bodyLines: fallbackBody,
      })
    } catch (error) {
      if (error instanceof ParseError) throw error
      throw new ParseError(`TxtChapterParser failed for ${rawFilePath}`, { cause: error })
    } finally {
      stream?.close()
    }
  }

  private buildChapter(ordinal: number, chapter: BufferedChapter): ParsedChapter {
    const plainText = chapter.bodyLines.join('\n').replace(/^\n+|\n+$/g, '')
    const tokenCount = this.tokenizer.encode(plainText).length
    return {
      ordinal,
      title: chapter.title,
      plainText,
      tokenCount,
    }
  }
}

function matchesAny(line: string, patterns: readonly RegExp[]): boolean {
  const trimmed = line.trim()
  if (trimmed.length === 0) return false
  for (const pattern of patterns) {
    if (pattern.test(trimmed)) return true
  }
  return false
}
