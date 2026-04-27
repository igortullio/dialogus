import type { ChunkReadDto } from '@dialogus/shared/schemas/ingestion'
import type { Book } from '../../../src/lib/api/_schemas'

export const FIXTURE_CHUNK_ID = '11111111-1111-4111-8111-111111111111'
export const FIXTURE_BOOK_ID = '22222222-2222-4222-8222-222222222222'
export const FIXTURE_CHAPTER_ID = '33333333-3333-4333-8333-333333333333'

export function makeChunk(overrides: Partial<ChunkReadDto> = {}): ChunkReadDto {
  return {
    id: FIXTURE_CHUNK_ID,
    book_id: FIXTURE_BOOK_ID,
    chapter_id: FIXTURE_CHAPTER_ID,
    chapter_title: 'O delírio',
    chapter_ordinal: 7,
    ordinal: 0,
    text: 'Era convalescente; a febre tinha deixado-me, e eu retornava aos poucos à vida real, com aquele doce abandono dos que escapam da morte.',
    token_count: 27,
    start_char: 0,
    end_char: 130,
    ...overrides,
  }
}

export function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: FIXTURE_BOOK_ID,
    gutendex_id: 54829,
    title: 'Memórias Póstumas de Brás Cubas',
    authors: [{ name: 'Machado de Assis', birth_year: 1839, death_year: 1908 }],
    languages: ['pt'],
    subjects: ['Brazilian literature', 'Realism'],
    download_url_epub: null,
    download_url_txt: null,
    cover_url: null,
    raw_hash: null,
    ingestion_status: 'ready',
    ingestion_error: null,
    tags: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}
