import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEncoding } from 'js-tiktoken'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ParseError } from '../../../src/domain/ingestion/IngestionError'
import type { ParsedChapter } from '../../../src/domain/parser/ChapterParser.port'
import { EpubChapterParser } from '../../../src/infrastructure/parsing/EpubChapterParser'

const here = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(here, '..', '..', '..', '__fixtures__', 'epub')
const SAMPLE_EN = join(fixturesDir, 'sample-en.epub')
const SAMPLE_PT = join(fixturesDir, 'sample-pt.epub')

async function collect(iter: AsyncIterable<ParsedChapter>): Promise<ParsedChapter[]> {
  const result: ParsedChapter[] = []
  for await (const chapter of iter) result.push(chapter)
  return result
}

describe('EpubChapterParser — gxl primary', () => {
  it('parses the EN sample fixture into ≥ 2 chapters with tokens + text', async () => {
    const parser = new EpubChapterParser()
    const chapters = await collect(parser.parse(SAMPLE_EN, 'en'))
    expect(chapters.length).toBeGreaterThanOrEqual(2)
    expect(chapters.map((c) => c.ordinal)).toEqual([1, 2, 3])
    expect(chapters[0]?.title).toMatch(/Loomings/i)
    expect(chapters[0]?.plainText).toContain('Ishmael')
    expect(chapters[1]?.plainText).toContain('carpet-bag')
    for (const chapter of chapters) {
      expect(chapter.plainText.length).toBeGreaterThan(0)
      expect(chapter.tokenCount).toBeGreaterThan(0)
    }
  })

  it('parses the PT sample fixture into ≥ 2 chapters with tokens + text', async () => {
    const parser = new EpubChapterParser()
    const chapters = await collect(parser.parse(SAMPLE_PT, 'pt'))
    expect(chapters.length).toBeGreaterThanOrEqual(2)
    expect(chapters[0]?.title).toMatch(/título/i)
    expect(chapters[0]?.plainText).toContain('Engenho Novo')
    expect(chapters[1]?.plainText).toContain('expliquei')
    for (const chapter of chapters) {
      expect(chapter.tokenCount).toBeGreaterThan(0)
    }
  })

  it('uses cl100k_base encoding lengths for tokenCount', async () => {
    const parser = new EpubChapterParser()
    const chapters = await collect(parser.parse(SAMPLE_EN, 'en'))
    const enc = getEncoding('cl100k_base')
    for (const chapter of chapters) {
      expect(chapter.tokenCount).toBe(enc.encode(chapter.plainText).length)
    }
  })

  it('throws ParseError when the file is not a valid epub', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'epub-corrupt-'))
    const file = join(dir, 'broken.epub')
    await writeFile(file, 'this is not an epub archive')
    try {
      const parser = new EpubChapterParser()
      await expect(collect(parser.parse(file, 'en'))).rejects.toBeInstanceOf(ParseError)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('throws ParseError when the parser yields zero sections', async () => {
    const parser = new EpubChapterParser({
      parser: async () => ({ sections: [] }),
    })
    await expect(collect(parser.parse('/anywhere.epub', 'en'))).rejects.toBeInstanceOf(ParseError)
  })

  it('falls back to humanized id then "Chapter N" when structure has no titles', async () => {
    const parser = new EpubChapterParser({
      parser: async () => ({
        sections: [
          { id: 'foo', htmlString: '<p>First body.</p>' },
          { id: 'chapter02', htmlString: '<p>Second body.</p>' },
          { id: '', htmlString: '<p>Third body.</p>' },
        ],
        structure: [],
      }),
    })
    const chapters = await collect(parser.parse('/anywhere.epub', 'en'))
    expect(chapters).toHaveLength(3)
    expect(chapters[0]?.title).toBe('Chapter 1')
    expect(chapters[1]?.title).toBe('Chapter 02')
    expect(chapters[2]?.title).toBe('Chapter 3')
  })
})

describe('EpubChapterParser — streaming', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'epub-parser-stream-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('yields the first chapter before processing the rest', async () => {
    const order: string[] = []
    const parser = new EpubChapterParser({
      parser: async () => ({
        sections: [
          { id: 'a', htmlString: '<p>Body A</p>' },
          { id: 'b', htmlString: '<p>Body B</p>' },
          { id: 'c', htmlString: '<p>Body C</p>' },
        ],
        structure: [
          { name: 'Alpha', path: 'a.xhtml' },
          { name: 'Beta', path: 'b.xhtml' },
          { name: 'Gamma', path: 'c.xhtml' },
        ],
      }),
    })
    let firstSeenAt = -1
    let index = 0
    for await (const chapter of parser.parse('/anywhere.epub', 'en')) {
      order.push(chapter.title)
      if (firstSeenAt === -1) firstSeenAt = index
      index += 1
    }
    expect(order).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(firstSeenAt).toBe(0)
  })
})
