import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type HttpHandler, HttpResponse, http } from 'msw'

const here = dirname(fileURLToPath(import.meta.url))

export const FIXTURE_BASE_URL = 'https://gutendex.test'

export const SEARCH_DON_QUIXOTE = JSON.parse(
  readFileSync(join(here, 'search-don-quixote.json'), 'utf8'),
) as Record<string, unknown>

export const SEARCH_MACHADO = JSON.parse(
  readFileSync(join(here, 'search-machado.json'), 'utf8'),
) as Record<string, unknown>

export const BOOK_996 = JSON.parse(readFileSync(join(here, 'book-996.json'), 'utf8')) as Record<
  string,
  unknown
>

export const FIVE_XX_BODY = JSON.parse(readFileSync(join(here, '5xx.json'), 'utf8')) as Record<
  string,
  unknown
>

export const VALIDATION_FAILURE = JSON.parse(
  readFileSync(join(here, 'validation-failure.json'), 'utf8'),
) as Record<string, unknown>

function searchUrl(): string {
  return `${FIXTURE_BASE_URL}/books`
}

function bookUrl(id: number): string {
  return `${FIXTURE_BASE_URL}/books/${id}`
}

export const happyPathHandlers: HttpHandler[] = [
  http.get(searchUrl(), ({ request }) => {
    const search = new URL(request.url).searchParams.get('search') ?? ''
    if (search.toLowerCase().includes('machado')) {
      return HttpResponse.json(SEARCH_MACHADO)
    }
    return HttpResponse.json(SEARCH_DON_QUIXOTE)
  }),
  http.get(bookUrl(996), () => HttpResponse.json(BOOK_996)),
]

export function fiveHundredHandler(targetId?: number): HttpHandler {
  if (targetId === undefined) {
    return http.get(searchUrl(), () => HttpResponse.json(FIVE_XX_BODY, { status: 503 }))
  }
  return http.get(bookUrl(targetId), () => HttpResponse.json(FIVE_XX_BODY, { status: 503 }))
}

export function fourHundredHandler(targetId: number): HttpHandler {
  return http.get(bookUrl(targetId), () =>
    HttpResponse.json({ detail: 'Not found' }, { status: 404 }),
  )
}

export function validationFailureHandler(): HttpHandler {
  return http.get(searchUrl(), () => HttpResponse.json(VALIDATION_FAILURE))
}

export function networkErrorHandler(): HttpHandler {
  return http.get(searchUrl(), () => HttpResponse.error())
}
