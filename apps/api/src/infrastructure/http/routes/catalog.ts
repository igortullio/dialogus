import {
  type GutendexClient,
  type GutendexLanguage,
  type GutendexSearchQuery,
  getGutendexBook,
  type RemoteBook,
  searchGutendex,
} from '@dialogus/catalog'
import { envelope } from '@dialogus/shared/http/envelope'
import { searchRequestSchema } from '@dialogus/shared/schemas/catalog'
import { Hono } from 'hono'
import { z } from 'zod'
import { decodeCatalogCursor, encodeCatalogCursor } from '../cursor-catalog'

const bookIdParamSchema = z.object({
  gutendex_id: z.coerce.number().int().nonnegative(),
})

interface CatalogBookWire {
  id: number
  title: string
  authors: Array<{ name: string; birth_year: number | null; death_year: number | null }>
  languages: string[]
  subjects: string[]
  download_url_epub: string | null
  download_url_txt: string | null
  cover_url: string | null
}

function toCatalogWire(book: RemoteBook): CatalogBookWire {
  return {
    id: book.gutendexId,
    title: book.title,
    authors: book.authors.map((a) => ({
      name: a.name,
      birth_year: a.birthYear,
      death_year: a.deathYear,
    })),
    languages: [...book.languages],
    subjects: [...book.subjects],
    download_url_epub: book.downloadUrlEpub,
    download_url_txt: book.downloadUrlTxt,
    cover_url: book.coverUrl,
  }
}

function pageFromCursor(cursor: string | undefined): number | undefined {
  if (cursor === undefined) return undefined
  const url = decodeCatalogCursor(cursor)
  const pageStr = url.searchParams.get('page')
  if (pageStr === null) return undefined
  const page = Number(pageStr)
  if (!Number.isInteger(page) || page < 1) return undefined
  return page
}

function pathOf(requestUrl: string): string {
  return new URL(requestUrl).pathname
}

export interface CatalogRouteDeps {
  readonly gutendexClient: GutendexClient
}

export function createCatalogRoute(deps: CatalogRouteDeps): Hono {
  const app = new Hono()

  app.get('/search', async (c) => {
    const query = searchRequestSchema.parse(c.req.query())
    const page = pageFromCursor(query.cursor)
    const gutendexQuery: GutendexSearchQuery = { limit: query.limit }
    if (query.q !== undefined) gutendexQuery.q = query.q
    if (query.language !== undefined) {
      gutendexQuery.languages = [query.language as GutendexLanguage]
    }
    if (query.topic !== undefined) gutendexQuery.topic = query.topic
    if (query.sort !== undefined) gutendexQuery.sort = query.sort
    if (page !== undefined) gutendexQuery.page = page

    const result = await searchGutendex({ client: deps.gutendexClient }, gutendexQuery)
    const path = pathOf(c.req.url)
    const links: Record<string, string> = { self: path }
    if (result.nextPage !== null) {
      links.next = `${path}?cursor=${encodeCatalogCursor(result.nextPage)}`
    }
    return c.json(
      envelope(result.books.map(toCatalogWire), { meta: { count: result.count }, links }),
      200,
    )
  })

  app.get('/books/:gutendex_id', async (c) => {
    const { gutendex_id } = bookIdParamSchema.parse(c.req.param())
    const book = await getGutendexBook({ client: deps.gutendexClient }, gutendex_id)
    return c.json(envelope(toCatalogWire(book)), 200)
  })

  return app
}
