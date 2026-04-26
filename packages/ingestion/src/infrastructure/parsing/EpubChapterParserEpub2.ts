import { basename } from 'node:path'
import { EPub } from 'epub2'
import { getEncoding, type Tiktoken } from 'js-tiktoken'
import { ParseError } from '../../domain/ingestion/IngestionError'
import type {
  ChapterParser,
  ParsedChapter,
  SupportedLanguage,
} from '../../domain/parser/ChapterParser.port'
import { htmlToPlainText } from './html-to-text'

const TOKEN_ENCODING = 'cl100k_base' as const

interface Epub2TocElement {
  readonly id?: string
  readonly title?: string
  readonly href?: string
}

interface Epub2Document {
  readonly flow?: Epub2TocElement[]
  readonly toc?: Epub2TocElement[]
  getChapterAsync(chapterId: string): Promise<string>
}

type Epub2Loader = (filePath: string) => Promise<Epub2Document>

export interface EpubChapterParserEpub2Options {
  readonly tokenizer?: Tiktoken
  readonly loader?: Epub2Loader
}

const defaultLoader: Epub2Loader = (filePath) =>
  EPub.createAsync(filePath) as unknown as Promise<Epub2Document>

export class EpubChapterParserEpub2 implements ChapterParser {
  private readonly tokenizer: Tiktoken
  private readonly loader: Epub2Loader

  constructor(options: EpubChapterParserEpub2Options = {}) {
    this.tokenizer = options.tokenizer ?? getEncoding(TOKEN_ENCODING)
    this.loader = options.loader ?? defaultLoader
  }

  async *parse(rawFilePath: string, _language: SupportedLanguage): AsyncIterable<ParsedChapter> {
    let epub: Epub2Document
    try {
      epub = await this.loader(rawFilePath)
    } catch (error) {
      throw new ParseError(`epub2 failed to load ${rawFilePath}`, { cause: error })
    }
    const entries = pickEntries(epub)
    if (entries.length === 0) {
      throw new ParseError(`epub2 produced no spine entries for ${rawFilePath}`)
    }
    let ordinal = 0
    for (const entry of entries) {
      if (!entry.id) continue
      let html: string
      try {
        html = await epub.getChapterAsync(entry.id)
      } catch (error) {
        throw new ParseError(
          `epub2 getChapterAsync failed for chapter ${entry.id} of ${rawFilePath}`,
          { cause: error },
        )
      }
      const plainText = htmlToPlainText(html)
      if (plainText.length === 0) continue
      ordinal += 1
      const title = pickTitle({
        fromToc: entry.title,
        href: entry.href,
        sectionId: entry.id,
        ordinal,
      })
      yield {
        ordinal,
        title,
        plainText,
        tokenCount: this.tokenizer.encode(plainText).length,
      }
    }
    if (ordinal === 0) {
      throw new ParseError(`epub2 produced no readable chapters for ${rawFilePath}`)
    }
  }
}

function pickEntries(epub: Epub2Document): Epub2TocElement[] {
  if (epub.flow && epub.flow.length > 0) return epub.flow
  if (epub.toc && epub.toc.length > 0) return epub.toc
  return []
}

function pickTitle(args: {
  fromToc?: string
  href?: string
  sectionId: string
  ordinal: number
}): string {
  const fromToc = args.fromToc?.trim()
  if (fromToc && fromToc.length > 0) return fromToc
  const fromHref = humanizeHref(args.href)
  if (fromHref) return fromHref
  return `Chapter ${args.ordinal}`
}

function humanizeHref(href: string | undefined): string | null {
  if (!href) return null
  const base = basename(href).replace(/\.[^.]+$/, '')
  if (base.length === 0) return null
  const normalized = base.replace(/[-_]+/g, ' ').trim()
  if (normalized.length === 0) return null
  if (/^chap(?:ter)?\s*\d+$/i.test(normalized)) {
    const number = normalized.match(/\d+/)?.[0]
    if (number) return `Chapter ${number}`
  }
  return normalized
}
