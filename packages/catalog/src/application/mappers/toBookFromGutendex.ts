import type { Book } from '../../domain/book/Book'
import type { GutendexBook } from '../../domain/book/GutendexClient.port'

export type RemoteBook = Pick<
  Book,
  | 'gutendexId'
  | 'title'
  | 'authors'
  | 'languages'
  | 'subjects'
  | 'downloadUrlEpub'
  | 'downloadUrlTxt'
  | 'coverUrl'
>

export function toBookFromGutendex(dto: GutendexBook): RemoteBook {
  return {
    gutendexId: dto.id,
    title: dto.title,
    authors: dto.authors.map((a) => ({
      name: a.name,
      birthYear: a.birthYear,
      deathYear: a.deathYear,
    })),
    languages: [...dto.languages],
    subjects: [...dto.subjects],
    downloadUrlEpub: dto.downloadUrlEpub,
    downloadUrlTxt: dto.downloadUrlTxt,
    coverUrl: dto.coverUrl,
  }
}
