import { createDatabase } from '@dialogus/db'
import { loadConfig, loadEnvFromRoot } from '@dialogus/shared/config'
import { pino } from 'pino'
import { selectEmailProvider } from '../email'
import { createAuth } from './auth'

/**
 * One-off bootstrap for the first owner/admin account. Invite-only blocks public
 * sign-up, so the very first administrator is created here via Better Auth's
 * server context (internal adapter + password hashing) with role=admin.
 *
 * Usage:
 *   pnpm --filter @dialogus/api seed:owner -- --email you@example.com --password '<pw>' [--name 'Your Name']
 */

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const direct = process.argv.find((arg) => arg.startsWith(prefix))
  if (direct) return direct.slice(prefix.length)
  const idx = process.argv.indexOf(`--${name}`)
  if (idx !== -1) return process.argv[idx + 1]
  return undefined
}

async function main(): Promise<void> {
  loadEnvFromRoot()
  const config = loadConfig()
  const logger = pino({ name: 'seed-owner', level: config.LOG_LEVEL })
  const db = createDatabase(config.DATABASE_URL)
  const email = selectEmailProvider({
    nodeEnv: config.NODE_ENV,
    emailProviderEnv: config.EMAIL_PROVIDER,
    resendApiKey: config.RESEND_API_KEY,
    emailFrom: config.EMAIL_FROM,
    logger,
  })
  const auth = createAuth({ db, config, emailProvider: email.provider, logger })

  const emailAddr = parseArg('email') ?? process.env.OWNER_EMAIL
  const password = parseArg('password') ?? process.env.OWNER_PASSWORD
  const name = parseArg('name') ?? 'Owner'

  if (!emailAddr || !password) {
    logger.error('Usage: seed:owner -- --email <email> --password <password> [--name <name>]')
    process.exit(1)
  }

  const ctx = await auth.$context
  const normalizedEmail = emailAddr.trim().toLowerCase()

  const existing = await ctx.internalAdapter.findUserByEmail(normalizedEmail)
  if (existing) {
    logger.info({ email: normalizedEmail }, 'owner already exists; nothing to do')
    process.exit(0)
  }

  const hashedPassword = await ctx.password.hash(password)
  const created = await ctx.internalAdapter.createUser({
    email: normalizedEmail,
    name,
    emailVerified: true,
    role: 'admin',
  })
  await ctx.internalAdapter.createAccount({
    userId: created.id,
    providerId: 'credential',
    accountId: created.id,
    password: hashedPassword,
  })

  logger.info({ id: created.id, email: normalizedEmail, role: 'admin' }, 'owner seeded')
  process.exit(0)
}

void main()
