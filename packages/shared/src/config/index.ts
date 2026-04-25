import { z } from 'zod'
import { ConfigError } from '../errors/index.js'

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  WEB_PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  NEXT_PUBLIC_MASTRA_URL: z.string().url().optional(),
})

export type DialogusEnv = z.infer<typeof envSchema>

export function loadConfig(): DialogusEnv {
  const parsed = envSchema.safeParse(process.env)
  if (parsed.success) return parsed.data

  const lines = parsed.error.issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.join('.') : '(root)'
    return `- ${field}: ${issue.message}`
  })
  const message = `Invalid environment configuration:\n${lines.join('\n')}`
  throw new ConfigError('INVALID_ENV', message, parsed.error)
}
