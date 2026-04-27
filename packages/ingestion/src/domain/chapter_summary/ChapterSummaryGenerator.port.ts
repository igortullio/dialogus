import type { ParsedChapter, SupportedLanguage } from '../parser/ChapterParser.port'

export interface ChapterSummaryGeneration {
  readonly summary: string
  readonly tokenCount: number
  readonly model: string
}

export interface ChapterSummaryGenerator {
  generate(chapter: ParsedChapter, language: SupportedLanguage): Promise<ChapterSummaryGeneration>
}
