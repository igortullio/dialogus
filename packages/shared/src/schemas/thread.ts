import { z } from 'zod'

export const threadMetadataSchema = z.object({
  custom_title: z.string().nullable(),
  pinned: z.boolean(),
  // book_ids is set when the thread is created and identifies which books
  // the agent must ground its retrieval against. Optional here for backward
  // compatibility with older threads created before the field existed.
  book_ids: z.array(z.string()).optional(),
})

export type ThreadMetadata = z.infer<typeof threadMetadataSchema>

export const threadMetadataUpdateSchema = threadMetadataSchema.partial()

export type ThreadMetadataUpdate = z.infer<typeof threadMetadataUpdateSchema>
