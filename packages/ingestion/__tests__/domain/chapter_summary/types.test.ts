import { DialogusError } from '@dialogus/shared/errors'
import { describe, expect, it } from 'vitest'
import type { ChapterSummary } from '../../../src/domain/chapter_summary/ChapterSummary'
import type {
  ChapterSummaryGeneration,
  ChapterSummaryGenerator,
} from '../../../src/domain/chapter_summary/ChapterSummaryGenerator.port'
import type { ChapterSummaryRepository } from '../../../src/domain/chapter_summary/ChapterSummaryRepository.port'
import { SummarizeError } from '../../../src/domain/ingestion/IngestionError'
import type { ParsedChapter } from '../../../src/domain/parser/ChapterParser.port'
import * as ingestion from '../../../src/index'

const SUMMARY: ChapterSummary = {
  id: '00000000-0000-0000-0000-000000000001',
  chapterId: '00000000-0000-0000-0000-000000000002',
  bookId: '00000000-0000-0000-0000-000000000003',
  summary: 'Concise scholarly summary of the chapter.',
  tokenCount: 256,
  model: 'claude-haiku-4-5',
  generatedAt: new Date('2026-04-27T00:00:00Z'),
}

const PARSED_CHAPTER: ParsedChapter = {
  ordinal: 1,
  title: 'Chapter I',
  plainText: 'Plain text body…',
  tokenCount: 1234,
}

class FakeRepository implements ChapterSummaryRepository {
  async save(summary: ChapterSummary): Promise<ChapterSummary> {
    return summary
  }
  async findByChapterId(_chapterId: string): Promise<ChapterSummary | null> {
    return null
  }
  async listMissingChapterIds(_bookId: string): Promise<string[]> {
    return []
  }
}

class FakeGenerator implements ChapterSummaryGenerator {
  async generate(chapter: ParsedChapter, language: 'en' | 'pt'): Promise<ChapterSummaryGeneration> {
    return {
      summary: `[${language}] ${chapter.title}`,
      tokenCount: 64,
      model: 'mock-model',
    }
  }
}

describe('ChapterSummary entity', () => {
  it('matches the chapter_summaries table shape with all fields populated', () => {
    expect(SUMMARY.id).toBe('00000000-0000-0000-0000-000000000001')
    expect(SUMMARY.chapterId).toBe('00000000-0000-0000-0000-000000000002')
    expect(SUMMARY.bookId).toBe('00000000-0000-0000-0000-000000000003')
    expect(SUMMARY.summary).toMatch(/scholarly summary/)
    expect(SUMMARY.tokenCount).toBe(256)
    expect(SUMMARY.model).toBe('claude-haiku-4-5')
    expect(SUMMARY.generatedAt).toBeInstanceOf(Date)
    expect(Object.keys(SUMMARY).sort()).toEqual([
      'bookId',
      'chapterId',
      'generatedAt',
      'id',
      'model',
      'summary',
      'tokenCount',
    ])
  })
})

describe('ChapterSummaryRepository port', () => {
  it('accepts a structurally compatible implementation that round-trips a summary', async () => {
    const repo: ChapterSummaryRepository = new FakeRepository()
    await expect(repo.save(SUMMARY)).resolves.toEqual(SUMMARY)
    await expect(repo.findByChapterId(SUMMARY.chapterId)).resolves.toBeNull()
    await expect(repo.listMissingChapterIds(SUMMARY.bookId)).resolves.toEqual([])
  })
})

describe('ChapterSummaryGenerator port', () => {
  it('generates from a ParsedChapter + language and returns summary metadata', async () => {
    const generator: ChapterSummaryGenerator = new FakeGenerator()
    const result = await generator.generate(PARSED_CHAPTER, 'pt')
    expect(result).toEqual({
      summary: '[pt] Chapter I',
      tokenCount: 64,
      model: 'mock-model',
    })
  })
})

describe('SummarizeError', () => {
  it('inherits the ingestion error base with the documented code and retryable: true', () => {
    const err = new SummarizeError('anthropic 503 timeout')
    expect(err).toBeInstanceOf(DialogusError)
    expect(err).toBeInstanceOf(SummarizeError)
    expect(err.code).toBe('INGESTION_SUMMARIZE_FAILED')
    expect(err.retryable).toBe(true)
    expect(err.name).toBe('SummarizeError')
    expect(err.message).toBe('anthropic 503 timeout')
  })

  it('preserves the cause and allows retryable to be overridden', () => {
    const cause = new Error('upstream 429')
    const err = new SummarizeError('anthropic rate-limited', { cause, retryable: false })
    expect(err.cause).toBe(cause)
    expect(err.retryable).toBe(false)
  })
})

describe('@dialogus/ingestion barrel', () => {
  it('re-exports ChapterSummary domain types and SummarizeError', () => {
    expect(ingestion.SummarizeError).toBe(SummarizeError)
    const repo: ingestion.ChapterSummaryRepository = new FakeRepository()
    const generator: ingestion.ChapterSummaryGenerator = new FakeGenerator()
    const summary: ingestion.ChapterSummary = SUMMARY
    expect(repo).toBeInstanceOf(FakeRepository)
    expect(generator).toBeInstanceOf(FakeGenerator)
    expect(summary).toBe(SUMMARY)
  })
})
