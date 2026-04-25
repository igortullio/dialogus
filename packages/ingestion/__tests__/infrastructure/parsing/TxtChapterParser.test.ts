import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEncoding } from 'js-tiktoken'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ParsedChapter } from '../../../src/domain/parser/ChapterParser.port'
import { TxtChapterParser } from '../../../src/infrastructure/parsing/TxtChapterParser'

const here = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(here, '..', '..', '..', '__fixtures__', 'txt')

async function collect(iter: AsyncIterable<ParsedChapter>): Promise<ParsedChapter[]> {
  const result: ParsedChapter[] = []
  for await (const chapter of iter) result.push(chapter)
  return result
}

describe('TxtChapterParser — EN fixtures', () => {
  it('parses Moby Dick excerpt into 3+ chapters with sequential ordinals', async () => {
    const parser = new TxtChapterParser()
    const chapters = await collect(parser.parse(join(fixturesDir, 'moby-dick-excerpt.txt'), 'en'))
    expect(chapters.length).toBeGreaterThanOrEqual(3)
    for (const [idx, c] of chapters.entries()) {
      expect(c.ordinal).toBe(idx + 1)
      expect(c.title).toMatch(/^CHAPTER /i)
      expect(c.plainText.length).toBeGreaterThan(0)
      expect(c.tokenCount).toBeGreaterThan(0)
    }
    expect(chapters[0]?.plainText).toContain('Ishmael')
    expect(chapters[1]?.plainText).toContain('carpet-bag')
    expect(chapters[2]?.plainText).toContain('Spouter-Inn')
  })

  it('parses Crime and Punishment excerpt into 3+ chapters', async () => {
    const parser = new TxtChapterParser()
    const chapters = await collect(
      parser.parse(join(fixturesDir, 'crime-and-punishment-excerpt.txt'), 'en'),
    )
    expect(chapters.length).toBeGreaterThanOrEqual(3)
    expect(chapters.map((c) => c.ordinal)).toEqual([1, 2, 3])
    expect(chapters[0]?.plainText).toContain('garret')
    expect(chapters[1]?.plainText).toContain('Raskolnikov')
  })

  it('parses Pride and Prejudice excerpt with mixed-case "Chapter N" headings', async () => {
    const parser = new TxtChapterParser()
    const chapters = await collect(
      parser.parse(join(fixturesDir, 'pride-and-prejudice-excerpt.txt'), 'en'),
    )
    expect(chapters.length).toBeGreaterThanOrEqual(3)
    expect(chapters[0]?.title).toMatch(/^Chapter 1/)
    expect(chapters[0]?.plainText).toContain('truth universally acknowledged')
  })
})

describe('TxtChapterParser — PT fixtures', () => {
  it('parses Dom Casmurro excerpt into 3+ PT chapters', async () => {
    const parser = new TxtChapterParser()
    const chapters = await collect(
      parser.parse(join(fixturesDir, 'dom-casmurro-excerpt.txt'), 'pt'),
    )
    expect(chapters.length).toBeGreaterThanOrEqual(3)
    expect(chapters.map((c) => c.ordinal)).toEqual([1, 2, 3])
    for (const c of chapters) {
      expect(c.title).toMatch(/^CAPÍTULO /i)
    }
    expect(chapters[0]?.plainText).toContain('Engenho Novo')
  })

  it('parses Memórias Póstumas excerpt with "Capítulo N" headings', async () => {
    const parser = new TxtChapterParser()
    const chapters = await collect(
      parser.parse(join(fixturesDir, 'memorias-postumas-excerpt.txt'), 'pt'),
    )
    expect(chapters.length).toBeGreaterThanOrEqual(3)
    expect(chapters[0]?.title).toMatch(/^Capítulo 1/)
    expect(chapters[0]?.plainText).toContain('memórias')
  })

  it('parses Os Lusíadas excerpt with "PARTE N" headings', async () => {
    const parser = new TxtChapterParser()
    const chapters = await collect(parser.parse(join(fixturesDir, 'os-lusiadas-excerpt.txt'), 'pt'))
    expect(chapters.length).toBeGreaterThanOrEqual(3)
    for (const c of chapters) {
      expect(c.title).toMatch(/^PARTE /i)
    }
    expect(chapters[0]?.plainText).toContain('Lusitana')
  })
})

describe('TxtChapterParser — fallback path', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'txt-parser-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('yields a single chapter using the EN fallback_title when no headers match', async () => {
    const file = join(dir, 'no-markers.txt')
    await writeFile(file, 'Just a plain stretch of prose.\nSecond line.\n', 'utf8')
    const parser = new TxtChapterParser()
    const chapters = await collect(parser.parse(file, 'en'))
    expect(chapters).toHaveLength(1)
    expect(chapters[0]?.ordinal).toBe(1)
    expect(chapters[0]?.title).toBe('Full text')
    expect(chapters[0]?.plainText).toContain('plain stretch')
  })

  it('yields a single chapter using the PT fallback_title when no headers match', async () => {
    const file = join(dir, 'no-markers-pt.txt')
    await writeFile(file, 'Apenas um trecho contínuo de prosa.\n', 'utf8')
    const parser = new TxtChapterParser()
    const chapters = await collect(parser.parse(file, 'pt'))
    expect(chapters).toHaveLength(1)
    expect(chapters[0]?.title).toBe('Texto completo')
  })
})

describe('TxtChapterParser — token counting', () => {
  it('uses cl100k_base encoding lengths matching js-tiktoken.encode', async () => {
    const parser = new TxtChapterParser()
    const chapters = await collect(parser.parse(join(fixturesDir, 'moby-dick-excerpt.txt'), 'en'))
    const enc = getEncoding('cl100k_base')
    for (const chapter of chapters) {
      expect(chapter.tokenCount).toBe(enc.encode(chapter.plainText).length)
    }
  })
})

describe('TxtChapterParser — streaming', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'txt-parser-stream-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('yields chapters incrementally without buffering the entire 1MB+ file', async () => {
    const file = join(dir, 'large.txt')
    const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50)
    const chapterCount = 20
    const lines: string[] = []
    for (let i = 1; i <= chapterCount; i += 1) {
      lines.push(`CHAPTER ${i}`, '', paragraph, paragraph, '')
    }
    await writeFile(file, lines.join('\n'), 'utf8')

    const parser = new TxtChapterParser()
    const seen: ParsedChapter[] = []
    let peakHeapAfterFirst = 0
    let baselineHeap = 0
    for await (const chapter of parser.parse(file, 'en')) {
      seen.push(chapter)
      if (seen.length === 1) {
        baselineHeap = process.memoryUsage().heapUsed
      } else {
        const used = process.memoryUsage().heapUsed
        if (used > peakHeapAfterFirst) peakHeapAfterFirst = used
      }
    }
    expect(seen).toHaveLength(chapterCount)
    expect(seen[0]?.ordinal).toBe(1)
    // Heap growth between yields stays within ~50MB even on a 1MB+ file.
    expect(peakHeapAfterFirst - baselineHeap).toBeLessThan(50 * 1024 * 1024)
  })
})
