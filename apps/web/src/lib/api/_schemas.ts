import { ingestionStatusEnum, threadMetadataSchema } from '@dialogus/shared/schemas'
import { z } from 'zod'

const bookAuthorSchema = z.object({
  name: z.string(),
  birth_year: z.number().int().nullable(),
  death_year: z.number().int().nullable(),
})

export const bookSchema = z.object({
  id: z.uuid(),
  gutendex_id: z.number().int().nonnegative(),
  title: z.string(),
  authors: z.array(bookAuthorSchema),
  languages: z.array(z.string()),
  subjects: z.array(z.string()),
  download_url_epub: z.string().url().nullable(),
  download_url_txt: z.string().url().nullable(),
  cover_url: z.string().url().nullable(),
  raw_hash: z.string().nullable(),
  ingestion_status: ingestionStatusEnum,
  ingestion_error: z.string().nullable(),
  tags: z.array(z.string()),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  deleted_at: z.iso.datetime({ offset: true }).nullable(),
})

export type Book = z.infer<typeof bookSchema>

export const bookListSchema = z.array(bookSchema)

export const gutendexBookSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string(),
  authors: z.array(bookAuthorSchema),
  languages: z.array(z.string()),
  subjects: z.array(z.string()),
  download_url_epub: z.string().url().nullable(),
  download_url_txt: z.string().url().nullable(),
  cover_url: z.string().url().nullable(),
})

export type GutendexBook = z.infer<typeof gutendexBookSchema>

export const gutendexBookListSchema = z.array(gutendexBookSchema)

export const threadSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable().optional(),
  resourceId: z.string().min(1),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
  metadata: threadMetadataSchema.partial().nullable().optional(),
})

export type Thread = z.infer<typeof threadSchema>

export const threadListSchema = z.array(threadSchema)
