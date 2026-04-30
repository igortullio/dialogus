import { z } from 'zod'
import { bookDtoSchema } from './book'
import { ingestionStatusEnum } from './ingestion'

export const LIBRARY_LANGUAGE_VALUES = ['en', 'pt'] as const
export const libraryLanguageEnum = z.enum(LIBRARY_LANGUAGE_VALUES)
export type LibraryLanguage = z.infer<typeof libraryLanguageEnum>

export const addBookRequestSchema = z.object({
  gutendex_id: z.coerce.number().int().nonnegative(),
})
export type AddBookRequest = z.infer<typeof addBookRequestSchema>

export const listLibraryQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(32).default(32),
  status: ingestionStatusEnum.optional(),
  language: libraryLanguageEnum.optional(),
  include_deleted: z.stringbool().optional(),
})
export type ListLibraryQuery = z.infer<typeof listLibraryQuerySchema>

export const bookResponseSchema = z.object({
  data: bookDtoSchema,
})
export type BookResponse = z.infer<typeof bookResponseSchema>

export const listLibraryResponseMetaSchema = z.object({
  count: z.number().int().nonnegative(),
})

export const listLibraryResponseLinksSchema = z.object({
  next: z.string().optional(),
  prev: z.string().optional(),
  self: z.string().optional(),
})

export const listLibraryResponseSchema = z.object({
  data: z.array(bookDtoSchema),
  meta: listLibraryResponseMetaSchema,
  links: listLibraryResponseLinksSchema.optional(),
})
export type ListLibraryResponse = z.infer<typeof listLibraryResponseSchema>
