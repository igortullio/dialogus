import { z } from 'zod'
import { bookDtoSchema } from './book'

export const SEARCH_LANGUAGE_VALUES = ['en', 'pt'] as const
export const searchLanguageEnum = z.enum(SEARCH_LANGUAGE_VALUES)
export type SearchLanguage = z.infer<typeof searchLanguageEnum>

export const SEARCH_SORT_VALUES = ['popular', 'ascending', 'descending'] as const
export const searchSortEnum = z.enum(SEARCH_SORT_VALUES)
export type SearchSort = z.infer<typeof searchSortEnum>

export const searchRequestSchema = z.object({
  q: z.string().optional(),
  language: searchLanguageEnum.optional(),
  topic: z.string().optional(),
  sort: searchSortEnum.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(32).default(32),
})
export type SearchRequest = z.infer<typeof searchRequestSchema>

export const searchResponseMetaSchema = z.object({
  count: z.number().int().nonnegative(),
})

export const searchResponseLinksSchema = z.object({
  next: z.string().optional(),
  prev: z.string().optional(),
  self: z.string().optional(),
})

export const searchResponseSchema = z.object({
  data: z.array(bookDtoSchema),
  meta: searchResponseMetaSchema,
  links: searchResponseLinksSchema.optional(),
})
export type SearchResponse = z.infer<typeof searchResponseSchema>
