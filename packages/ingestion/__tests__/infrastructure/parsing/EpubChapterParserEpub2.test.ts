import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEncoding } from 'js-tiktoken'
import { describe, expect, it } from 'vitest'
import { ParseError } from '../../../src/domain/ingestion/IngestionError'
import type { ParsedChapter } from '../../../src/domain/parser/ChapterParser.port'
import { EpubChapterParserEpub2 } from '../../../src/infrastructure/parsing/EpubChapterParserEpub2'

const here = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(here, '..', '..', '..', '__fixtures__', 'epub')
const SAMPLE_EN = join(fixturesDir, 'sample-en.epub')
const SAMPLE_PT = join(fixturesDir, 'sample-pt.epub')

async function collect(iter: AsyncIterable<ParsedChapter>): Promise<ParsedChapter[]> {
  const result: ParsedChapter[] = []
  for await (const chapter of iter) result.push(chapter)
  return result
}

describe('EpubChapterParserEpub2 — fallback adapter', () => {
  it('parses the EN sample fixture into ≥ 2 chapters with the expected shape', async () => {
    const parser = new EpubChapterParserEpub2()
    const chapters = await collect(parser.parse(SAMPLE_EN, 'en'))
    expect(chapters.length).toBeGreaterThanOrEqual(2)
    expect(chapters.map((c) => c.ordinal)).toEqual([1, 2, 3])
    expect(chapters[0]?.title).toMatch(/Loomings/i)
    expect(chapters[0]?.plainText).toContain('Ishmael')
    expect(chapters[1]?.plainText).toContain('carpet-bag')
    for (const chapter of chapters) {
      expect(chapter.tokenCount).toBeGreaterThan(0)
    }
  })

  it('parses the PT sample fixture into ≥ 2 chapters', async () => {
    const parser = new EpubChapterParserEpub2()
    const chapters = await collect(parser.parse(SAMPLE_PT, 'pt'))
    expect(chapters.length).toBeGreaterThanOrEqual(2)
    expect(chapters[0]?.title).toMatch(/título/i)
    expect(chapters[0]?.plainText).toContain('Engenho Novo')
  })

  it('uses cl100k_base encoding lengths for tokenCount', async () => {
    const parser = new EpubChapterParserEpub2()
    const chapters = await collect(parser.parse(SAMPLE_EN, 'en'))
    const enc = getEncoding('cl100k_base')
    for (const chapter of chapters) {
      expect(chapter.tokenCount).toBe(enc.encode(chapter.plainText).length)
    }
  })

  it('throws ParseError on a non-epub file via the real loader', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'epub2-corrupt-'))
    const file = join(dir, 'broken.epub')
    await writeFile(file, 'not an epub')
    try {
      const parser = new EpubChapterParserEpub2()
      await expect(collect(parser.parse(file, 'en'))).rejects.toBeInstanceOf(ParseError)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('throws ParseError when the loader yields zero entries', async () => {
    const parser = new EpubChapterParserEpub2({
      loader: async () => ({
        flow: [],
        toc: [],
        getChapterAsync: async () => '',
      }),
    })
    await expect(collect(parser.parse('/x.epub', 'en'))).rejects.toBeInstanceOf(ParseError)
  })

  it('falls back to filename-derived title when toc lacks one', async () => {
    const parser = new EpubChapterParserEpub2({
      loader: async () => ({
        flow: [
          { id: 'a', href: 'OEBPS/intro.xhtml' },
          { id: 'b', href: 'OEBPS/chapter02.xhtml', title: '   ' },
          { id: 'c' },
        ],
        getChapterAsync: async (id: string) => `<p>Body ${id}</p>`,
      }),
    })
    const chapters = await collect(parser.parse('/x.epub', 'en'))
    expect(chapters.map((c) => c.title)).toEqual(['intro', 'Chapter 02', 'Chapter 3'])
  })

  it('wraps getChapterAsync failures in ParseError', async () => {
    const parser = new EpubChapterParserEpub2({
      loader: async () => ({
        flow: [{ id: 'a', title: 'A' }],
        getChapterAsync: async () => {
          throw new Error('zip blew up')
        },
      }),
    })
    await expect(collect(parser.parse('/x.epub', 'en'))).rejects.toBeInstanceOf(ParseError)
  })
})
