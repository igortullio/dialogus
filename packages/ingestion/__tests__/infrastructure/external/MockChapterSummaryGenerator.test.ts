import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { ParsedChapter } from '../../../src/domain/parser/ChapterParser.port'
import {
  MOCK_SUMMARY_GENERATOR_MODEL,
  MockChapterSummaryGenerator,
} from '../../../src/infrastructure/external/MockChapterSummaryGenerator'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function makeChapter(overrides: Partial<ParsedChapter> = {}): ParsedChapter {
  return {
    ordinal: 1,
    title: 'Loomings',
    plainText: 'Call me Ishmael...',
    tokenCount: 1234,
    ...overrides,
  }
}

describe('MockChapterSummaryGenerator', () => {
  it('returns model "mock-summary-generator"', async () => {
    const generator = new MockChapterSummaryGenerator()
    const result = await generator.generate(makeChapter(), 'en')
    expect(result.model).toBe(MOCK_SUMMARY_GENERATOR_MODEL)
    expect(MOCK_SUMMARY_GENERATOR_MODEL).toBe('mock-summary-generator')
  })

  it('produces a deterministic summary derived from the chapter title and tokenCount', async () => {
    const generator = new MockChapterSummaryGenerator()
    const result = await generator.generate(makeChapter(), 'en')
    expect(result.summary).toBe('Summary of Loomings. [1234 tokens in source]')
  })

  it('returns identical results on repeated calls with the same chapter (deterministic)', async () => {
    const generator = new MockChapterSummaryGenerator()
    const chapter = makeChapter({ title: 'O Aleph', tokenCount: 4242 })
    const first = await generator.generate(chapter, 'pt')
    const second = await generator.generate(chapter, 'pt')
    expect(first).toEqual(second)
  })

  it('reports tokenCount as the summary string length', async () => {
    const generator = new MockChapterSummaryGenerator()
    const result = await generator.generate(makeChapter(), 'en')
    expect(result.tokenCount).toBe(result.summary.length)
  })

  it('makes zero network calls (MSW would error on unhandled requests)', async () => {
    const generator = new MockChapterSummaryGenerator()
    await generator.generate(makeChapter(), 'en')
    expect(true).toBe(true)
  })

  it('runs in well under 1ms per call when iterated', async () => {
    const generator = new MockChapterSummaryGenerator()
    const start = Date.now()
    for (let i = 0; i < 200; i += 1) {
      await generator.generate(makeChapter({ ordinal: i, title: `Chapter ${i}` }), 'en')
    }
    const duration = Date.now() - start
    expect(duration).toBeLessThan(200)
  })
})
