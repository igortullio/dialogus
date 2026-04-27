import { z } from 'zod'

export const healthResponseSchema = z.object({
  api: z.literal('up'),
  db: z.enum(['up', 'down']),
  pgboss: z.enum(['up', 'down']),
  mastra: z.enum(['up', 'down']),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
