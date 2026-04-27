import { z } from 'zod'

export const chatStreamRequestSchema = z.object({
  message: z.string().min(1),
  book_ids: z.array(z.uuid()).min(1),
  spoiler_caps: z.record(z.uuid(), z.number().int().min(0)).optional(),
  thread_id: z.uuid().optional(),
})

export type ChatStreamRequest = z.infer<typeof chatStreamRequestSchema>
