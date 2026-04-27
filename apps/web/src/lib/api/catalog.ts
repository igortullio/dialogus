import { z } from 'zod'
import { apiBaseUrl, fetchEnvelope, nextCursorFromLinks } from './_envelope'
import { type GutendexBook, gutendexBookListSchema } from './_schemas'

const CATALOG_BASE = '/api/catalog'

export type GutendexLanguage = 'en' | 'pt'
export type GutendexSort = 'popular' | 'ascending' | 'descending'

export interface SearchGutendexParams {
  readonly q?: string
  readonly language?: GutendexLanguage
  readonly topic?: string
  readonly sort?: GutendexSort
  readonly cursor?: string
  readonly limit?: number
}

export interface SearchGutendexResult {
  readonly books: GutendexBook[]
  readonly nextCursor: string | null
  readonly count: number
}

const metaSchema = z.object({ count: z.number().int().nonnegative() })

export async function searchGutendex(
  params: SearchGutendexParams = {},
): Promise<SearchGutendexResult> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${CATALOG_BASE}/search`, {
    schema: gutendexBookListSchema,
    where: 'searchGutendex',
    query: {
      q: params.q,
      language: params.language,
      topic: params.topic,
      sort: params.sort,
      cursor: params.cursor,
      limit: params.limit,
    },
  })
  const meta = metaSchema.safeParse(envelope.meta)
  return {
    books: envelope.data,
    nextCursor: nextCursorFromLinks(envelope.links),
    count: meta.success ? meta.data.count : envelope.data.length,
  }
}
