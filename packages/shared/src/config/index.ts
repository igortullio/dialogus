import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import { ConfigError } from '../errors/index'

export function loadEnvFromRoot(startDir: string = process.cwd()): boolean {
  let dir = startDir
  while (true) {
    const candidate = resolve(dir, '.env')
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate)
      return true
    }
    const parent = dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  WEB_PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  MASTRA_PORT: z.coerce.number().int().min(0).max(65535).default(4111),
  MASTRA_STUDIO_PORT: z.coerce.number().int().min(0).max(65535).default(4111),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),
  NEXT_PUBLIC_MASTRA_URL: z.string().url().default('http://localhost:4111'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // --- Auth (feature 001-multi-user-auth) ---
  // Public base URL of the web app; used to build absolute invite/reset links
  // and as a default Better Auth trusted origin.
  APP_URL: z.string().url().default('http://localhost:3000'),
  // Comma-separated extra trusted origins for Better Auth CSRF/origin checks.
  AUTH_TRUSTED_ORIGINS: z.string().optional(),
  // Secret Better Auth uses to sign sessions/cookies/tokens. Guarded as
  // required in production at the point of use (see infrastructure/auth/auth.ts).
  BETTER_AUTH_SECRET: z.string().optional(),
  // Secret the Mastra server uses to verify forwarded sessions → resourceId.
  MASTRA_AUTH_SECRET: z.string().optional(),
  // Session inactivity / maximum age (default 7 days) and auth-abuse limit.
  SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(604_800),
  AUTH_RATE_LIMIT_SIGNIN_MAX: z.coerce.number().int().positive().default(5),
  // Max simultaneous in-flight ingestions a single user may have (FR-021).
  INGESTION_USER_CONCURRENCY_LIMIT: z.coerce.number().int().positive().default(2),

  // --- Ingestion progress observability (feature 002-ingestion-progress-tracking) ---
  // A non-terminal book whose row has not been touched for longer than this is
  // surfaced as "stalled" (suspected wedge), rather than an indefinitely frozen bar.
  INGESTION_STALL_THRESHOLD_MS: z.coerce.number().int().positive().default(60_000),
  // Minimum interval between download-stage progress/heartbeat writes, so a slow
  // download ticks (bytes/heartbeat) without hammering the row.
  INGESTION_DOWNLOAD_HEARTBEAT_MS: z.coerce.number().int().positive().default(1_000),

  // --- Email (invitations + password reset) ---
  // 'mock' logs the link (deterministic for dev/CI); 'resend' really sends.
  // Absent → 'resend' in production, else 'mock' (resolved in selectEmailProvider).
  EMAIL_PROVIDER: z.enum(['mock', 'resend']).optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
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
