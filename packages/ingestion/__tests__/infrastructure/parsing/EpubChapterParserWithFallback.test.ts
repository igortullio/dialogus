import { describe, expect, it, vi } from 'vitest'
import { ParseError } from '../../../src/domain/ingestion/IngestionError'
import type {
  ChapterParser,
  ParsedChapter,
  SupportedLanguage,
} from '../../../src/domain/parser/ChapterParser.port'
import {
  EpubChapterParserWithFallback,
  type FallbackLogger,
} from '../../../src/infrastructure/parsing/EpubChapterParserWithFallback'

async function collect(iter: AsyncIterable<ParsedChapter>): Promise<ParsedChapter[]> {
  const result: ParsedChapter[] = []
  for await (const chapter of iter) result.push(chapter)
  return result
}

function makeParser(
  yieldsFn: (file: string, language: SupportedLanguage) => AsyncIterable<ParsedChapter>,
): ChapterParser {
  return {
    parse(file, language) {
      return yieldsFn(file, language)
    },
  }
}

function chapter(ordinal: number, title = `C${ordinal}`): ParsedChapter {
  return { ordinal, title, plainText: `body ${ordinal}`, tokenCount: ordinal }
}

function failingParser(message: string): ChapterParser {
  return {
    parse() {
      const error = new Error(message)
      const iterator: AsyncIterator<ParsedChapter> = {
        next: () => Promise.reject(error),
      }
      return { [Symbol.asyncIterator]: () => iterator }
    },
  }
}

function unreachableParser(message: string): ChapterParser {
  return failingParser(message)
}

describe('EpubChapterParserWithFallback', () => {
  it('streams chapters from the primary parser when it succeeds', async () => {
    const primary = makeParser(async function* () {
      yield chapter(1, 'Alpha')
      yield chapter(2, 'Beta')
    })
    const fallback = unreachableParser('fallback should not be called')
    const logger: FallbackLogger = { warn: vi.fn() }
    const wrapper = new EpubChapterParserWithFallback({ primary, fallback, logger })
    const chapters = await collect(wrapper.parse('/book.epub', 'en'))
    expect(chapters.map((c) => c.title)).toEqual(['Alpha', 'Beta'])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('falls back to the secondary parser and logs warn when primary throws before yielding', async () => {
    const primary = failingParser('gxl explosion')
    const fallback = makeParser(async function* () {
      yield chapter(1, 'F1')
      yield chapter(2, 'F2')
    })
    const warn = vi.fn()
    const wrapper = new EpubChapterParserWithFallback({
      primary,
      fallback,
      logger: { warn },
    })
    const chapters = await collect(wrapper.parse('/book.epub', 'en'))
    expect(chapters.map((c) => c.title)).toEqual(['F1', 'F2'])
    expect(warn).toHaveBeenCalledTimes(1)
    const [message, meta] = warn.mock.calls[0] ?? []
    expect(message).toMatch(/falling back to epub2/i)
    expect(meta?.rawFilePath).toBe('/book.epub')
    expect(meta?.error).toContain('gxl explosion')
  })

  it('throws ParseError mentioning both failures when both parsers fail', async () => {
    const primary = failingParser('primary failed')
    const fallback = failingParser('fallback failed too')
    const wrapper = new EpubChapterParserWithFallback({
      primary,
      fallback,
      logger: { warn: vi.fn() },
    })
    const error = await collect(wrapper.parse('/book.epub', 'en')).catch((e) => e)
    expect(error).toBeInstanceOf(ParseError)
    expect((error as Error).message).toMatch(/both parsers failed/)
  })

  it('rethrows as ParseError without invoking fallback when primary fails mid-stream', async () => {
    const fallbackCalls = vi.fn()
    const primary = makeParser(async function* () {
      yield chapter(1, 'P1')
      throw new Error('primary mid-stream')
    })
    const fallback = makeParser(async function* () {
      fallbackCalls()
      yield chapter(99, 'F99')
    })
    const warn = vi.fn()
    const wrapper = new EpubChapterParserWithFallback({
      primary,
      fallback,
      logger: { warn },
    })
    const seen: string[] = []
    let caught: unknown = null
    try {
      for await (const c of wrapper.parse('/book.epub', 'en')) {
        seen.push(c.title)
      }
    } catch (error) {
      caught = error
    }
    expect(seen).toEqual(['P1'])
    expect(caught).toBeInstanceOf(ParseError)
    expect((caught as Error).message).toMatch(/cannot safely fall back/i)
    expect(fallbackCalls).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('falls back silently when no logger is provided', async () => {
    const primary = failingParser('boom')
    const fallback = makeParser(async function* () {
      yield chapter(1, 'OK')
    })
    const wrapper = new EpubChapterParserWithFallback({ primary, fallback })
    const chapters = await collect(wrapper.parse('/book.epub', 'en'))
    expect(chapters.map((c) => c.title)).toEqual(['OK'])
  })
})
