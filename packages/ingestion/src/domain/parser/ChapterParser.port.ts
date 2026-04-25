export type SupportedLanguage = 'en' | 'pt'

export interface ParsedChapter {
  readonly ordinal: number
  readonly title: string
  readonly plainText: string
  readonly tokenCount: number
}

export interface ChapterParser {
  parse(rawFilePath: string, language: SupportedLanguage): AsyncIterable<ParsedChapter>
}
