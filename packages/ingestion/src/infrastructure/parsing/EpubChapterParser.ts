import { basename } from 'node:path'
import gxlEpubParser from '@gxl/epub-parser'
import { getEncoding, type Tiktoken } from 'js-tiktoken'
import { ParseError } from '../../domain/ingestion/IngestionError'
import type {
  ChapterParser,
  ParsedChapter,
  SupportedLanguage,
} from '../../domain/parser/ChapterParser.port'
import { htmlToPlainText } from './html-to-text'

const TOKEN_ENCODING = 'cl100k_base' as const

interface GxlSection {
  readonly id: string
  readonly htmlString: string
}

interface GxlStructureNode {
  readonly name?: string
  readonly path?: string
  readonly sectionId?: string
  readonly children?: GxlStructureNode[]
}

interface GxlEpub {
  readonly sections?: GxlSection[]
  readonly structure?: GxlStructureNode[]
}

type GxlParseFn = (target: string) => Promise<GxlEpub>

export interface EpubChapterParserOptions {
  readonly tokenizer?: Tiktoken
  readonly parser?: GxlParseFn
}

const defaultParser: GxlParseFn = (target) =>
  (gxlEpubParser as unknown as { parseEpub: GxlParseFn }).parseEpub(target)

export class EpubChapterParser implements ChapterParser {
  private readonly tokenizer: Tiktoken
  private readonly parser: GxlParseFn

  constructor(options: EpubChapterParserOptions = {}) {
    this.tokenizer = options.tokenizer ?? getEncoding(TOKEN_ENCODING)
    this.parser = options.parser ?? defaultParser
  }

  async *parse(rawFilePath: string, _language: SupportedLanguage): AsyncIterable<ParsedChapter> {
    let epub: GxlEpub
    try {
      epub = await this.parser(rawFilePath)
    } catch (error) {
      throw new ParseError(`@gxl/epub-parser failed for ${rawFilePath}`, { cause: error })
    }
    const sections = epub.sections ?? []
    if (sections.length === 0) {
      throw new ParseError(`@gxl/epub-parser produced no sections for ${rawFilePath}`)
    }
    const titleByIndex = collectTitlesByIndex(epub.structure, sections.length)
    let ordinal = 0
    for (const section of sections) {
      ordinal += 1
      const plainText = htmlToPlainText(section.htmlString)
      if (plainText.length === 0) {
        ordinal -= 1
        continue
      }
      const title = pickTitle({
        explicit: titleByIndex[ordinal - 1],
        sectionId: section.id,
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
      throw new ParseError(`@gxl/epub-parser produced no readable chapters for ${rawFilePath}`)
    }
  }
}

function collectTitlesByIndex(
  structure: readonly GxlStructureNode[] | undefined,
  expectedLength: number,
): (string | undefined)[] {
  const titles: (string | undefined)[] = new Array(expectedLength).fill(undefined)
  if (!structure || structure.length === 0) return titles
  const flat: GxlStructureNode[] = []
  const stack: GxlStructureNode[] = [...structure]
  while (stack.length > 0) {
    const node = stack.shift()
    if (!node) continue
    if (typeof node.name === 'string' && node.name.trim().length > 0) {
      flat.push(node)
    }
    if (node.children && node.children.length > 0) {
      stack.push(...node.children)
    }
  }
  for (let i = 0; i < Math.min(flat.length, expectedLength); i += 1) {
    const node = flat[i]
    if (node?.name) titles[i] = node.name.trim()
  }
  return titles
}

function pickTitle(args: { explicit?: string; sectionId: string; ordinal: number }): string {
  const fromStructure = args.explicit?.trim()
  if (fromStructure && fromStructure.length > 0) return fromStructure
  const fromId = humanizeId(args.sectionId)
  if (fromId.length > 0) return fromId
  return `Chapter ${args.ordinal}`
}

function humanizeId(id: string): string {
  const base = basename(id, '.xhtml').replace(/\.html?$/i, '')
  if (base.length === 0) return ''
  const match = base.match(/^chap(?:ter)?\s*(\d+)$/i)
  if (match) return `Chapter ${match[1]}`
  return ''
}
