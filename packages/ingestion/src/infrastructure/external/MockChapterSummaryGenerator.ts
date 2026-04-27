import type {
  ChapterSummaryGeneration,
  ChapterSummaryGenerator,
} from '../../domain/chapter_summary/ChapterSummaryGenerator.port'
import type { ParsedChapter, SupportedLanguage } from '../../domain/parser/ChapterParser.port'

export const MOCK_SUMMARY_GENERATOR_MODEL = 'mock-summary-generator'

export class MockChapterSummaryGenerator implements ChapterSummaryGenerator {
  async generate(
    chapter: ParsedChapter,
    _language: SupportedLanguage,
  ): Promise<ChapterSummaryGeneration> {
    const summary = `Summary of ${chapter.title}. [${chapter.tokenCount} tokens in source]`
    return {
      summary,
      tokenCount: summary.length,
      model: MOCK_SUMMARY_GENERATOR_MODEL,
    }
  }
}
