import { z } from 'zod'
import { ingestionStatusEnum } from './ingestion.js'

export const bookAuthorSchema = z.object({
  name: z.string(),
  birth_year: z.number().int().nullable(),
  death_year: z.number().int().nullable(),
})
export type BookAuthor = z.infer<typeof bookAuthorSchema>

export const bookDtoSchema = z.object({
  id: z.uuid(),
  gutendex_id: z.number().int().nonnegative(),
  title: z.string(),
  authors: z.array(bookAuthorSchema),
  languages: z.array(z.string()),
  subjects: z.array(z.string()),
  download_url_epub: z.url().nullable(),
  download_url_txt: z.url().nullable(),
  cover_url: z.url().nullable(),
  ingestion_status: ingestionStatusEnum,
  ingestion_error: z.string().nullable(),
  tags: z.array(z.string()),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  deleted_at: z.iso.datetime({ offset: true }).nullable(),
})
export type BookDto = z.infer<typeof bookDtoSchema>

export const gutendexBookSchema = z.object({
  id: z.coerce.number().int().nonnegative(),
  title: z.string(),
  authors: z.array(bookAuthorSchema),
  translators: z.array(bookAuthorSchema).optional(),
  subjects: z.array(z.string()),
  bookshelves: z.array(z.string()).optional(),
  languages: z.array(z.string()),
  copyright: z.boolean().nullable().optional(),
  media_type: z.string().optional(),
  formats: z.record(z.string(), z.string()),
  download_count: z.number().int().nonnegative().optional(),
})
export type GutendexBook = z.infer<typeof gutendexBookSchema>
