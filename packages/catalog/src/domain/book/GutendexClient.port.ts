export type GutendexLanguage = 'en' | 'pt'

export type GutendexSort = 'popular' | 'ascending' | 'descending'

export interface GutendexAuthor {
  readonly name: string
  readonly birthYear: number | null
  readonly deathYear: number | null
}

export interface GutendexBook {
  readonly id: number
  readonly title: string
  readonly authors: readonly GutendexAuthor[]
  readonly languages: readonly string[]
  readonly subjects: readonly string[]
  readonly downloadUrlEpub: string | null
  readonly downloadUrlTxt: string | null
  readonly coverUrl: string | null
}

export interface GutendexSearchQuery {
  q?: string
  languages?: readonly GutendexLanguage[]
  topic?: string
  sort?: GutendexSort
  page?: number
  limit?: number
}

export interface GutendexSearchResult {
  books: GutendexBook[]
  nextPage: string | null
  count: number
}

export interface GutendexClient {
  search(query: GutendexSearchQuery): Promise<GutendexSearchResult>
  getBook(gutendexId: number): Promise<GutendexBook>
}
