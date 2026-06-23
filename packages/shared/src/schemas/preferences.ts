import { z } from 'zod'

// Account-scoped spoiler caps (`user_book_preferences`). The cap value reuses the
// `spoiler_caps` shape from chat.ts (a non-negative chapter ordinal). `null` means
// "no cap" (unbounded) and is distinct from `0` (hide everything). `userId` is
// always derived from the session — never the request.

const spoilerCapValue = z.number().int().min(0)

/** `?book_ids=<uuid>,<uuid>,…` → a validated uuid[] (empty when absent). */
export const spoilerCapsQuerySchema = z.object({
  book_ids: z
    .string()
    .optional()
    .transform((raw) => (raw ? raw.split(',').filter((s) => s.length > 0) : []))
    .pipe(z.array(z.uuid())),
})
export type SpoilerCapsQuery = z.infer<typeof spoilerCapsQuerySchema>

/** PUT body: a number caps chapters, `null` clears the cap. */
export const setSpoilerCapRequestSchema = z.object({
  spoiler_cap_chapter: spoilerCapValue.nullable(),
})
export type SetSpoilerCapRequest = z.infer<typeof setSpoilerCapRequestSchema>

export const spoilerCapBookIdParamSchema = z.object({ bookId: z.uuid() })

/** GET response payload (inside the `{ data }` envelope). */
export const spoilerCapsDataSchema = z.object({
  caps: z.record(z.uuid(), spoilerCapValue.nullable()),
})
export type SpoilerCapsData = z.infer<typeof spoilerCapsDataSchema>

/** PUT response payload (inside the `{ data }` envelope). */
export const spoilerCapDataSchema = z.object({
  book_id: z.uuid(),
  spoiler_cap_chapter: spoilerCapValue.nullable(),
})
export type SpoilerCapData = z.infer<typeof spoilerCapDataSchema>
