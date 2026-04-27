export const BOOK_1 = {
  id: '11111111-1111-4111-8111-111111111111',
  gutendex_id: 996,
  title: 'Don Quijote',
  authors: [{ name: 'Cervantes', birth_year: 1547, death_year: 1616 }],
  languages: ['es'],
  subjects: ['fiction'],
  download_url_epub: 'https://example.com/996.epub',
  download_url_txt: 'https://example.com/996.txt',
  cover_url: 'https://example.com/996.jpg',
  raw_hash: 'sha256:abc',
  ingestion_status: 'ready' as const,
  ingestion_error: null,
  tags: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  deleted_at: null,
} as const

export const BOOK_2 = {
  ...BOOK_1,
  id: '22222222-2222-4222-8222-222222222222',
  gutendex_id: 1184,
  title: 'The Count of Monte Cristo',
}

export const GUTENDEX_BOOK = {
  id: 996,
  title: 'Don Quijote',
  authors: [{ name: 'Cervantes', birth_year: 1547, death_year: 1616 }],
  languages: ['es'],
  subjects: ['fiction'],
  download_url_epub: 'https://example.com/996.epub',
  download_url_txt: 'https://example.com/996.txt',
  cover_url: 'https://example.com/996.jpg',
} as const

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  })
}
