import { z } from 'zod'

export const threadMetadataSchema = z.object({
  custom_title: z.string().nullable(),
  pinned: z.boolean(),
})

export type ThreadMetadata = z.infer<typeof threadMetadataSchema>

export const threadMetadataUpdateSchema = threadMetadataSchema.partial()

export type ThreadMetadataUpdate = z.infer<typeof threadMetadataUpdateSchema>
