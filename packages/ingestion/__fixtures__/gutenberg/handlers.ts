import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HttpResponse, http } from 'msw'

const here = dirname(fileURLToPath(import.meta.url))

export const SAMPLE_EPUB_PATH = join(here, 'sample.epub')
export const SAMPLE_TXT_PATH = join(here, 'sample.txt')

export const FIXTURE_BOOK_ID = 15
export const MISSING_BOOK_ID = 999

export const BASE_URL = 'https://aleph.gutenberg.org'

export function epubUrl(id: number): string {
  return `${BASE_URL}/cache/epub/${id}/pg${id}.epub.noimages`
}

export function txtUrl(id: number): string {
  return `${BASE_URL}/cache/epub/${id}/pg${id}.txt.utf8`
}

export const happyPathHandlers = [
  http.get(epubUrl(FIXTURE_BOOK_ID), async () => {
    const body = await readFile(SAMPLE_EPUB_PATH)
    return new HttpResponse(body, {
      headers: { 'content-type': 'application/epub+zip' },
    })
  }),
  http.get(txtUrl(FIXTURE_BOOK_ID), async () => {
    const body = await readFile(SAMPLE_TXT_PATH)
    return HttpResponse.text(body.toString('utf8'), {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }),
]
