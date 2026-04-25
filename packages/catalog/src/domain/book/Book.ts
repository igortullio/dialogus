import type { IngestionStatus } from './IngestionStatus'

export interface BookAuthor {
  readonly name: string
  readonly birthYear: number | null
  readonly deathYear: number | null
}

export interface Book {
  readonly id: string
  readonly gutendexId: number
  readonly title: string
  readonly authors: readonly BookAuthor[]
  readonly languages: readonly string[]
  readonly subjects: readonly string[]
  readonly downloadUrlEpub: string | null
  readonly downloadUrlTxt: string | null
  readonly coverUrl: string | null
  readonly rawHash: string | null
  readonly ingestionStatus: IngestionStatus
  readonly ingestionError: string | null
  readonly tags: readonly string[]
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly deletedAt: Date | null
}
