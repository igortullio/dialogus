#!/usr/bin/env tsx
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadConfig } from '@dialogus/shared/config'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { createDatabase } from './client'
import { logger } from './logger'
import { createPgBoss } from './pgboss'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(here, '..', 'drizzle')

export async function runMigrations(connectionString: string): Promise<void> {
  const db = createDatabase(connectionString)
  try {
    try {
      logger.info({ stage: 'drizzle' }, 'applying Drizzle migrations')
      await migrate(db, { migrationsFolder })
    } catch (error) {
      logger.error({ stage: 'drizzle', error }, 'Drizzle migration failed')
      throw error
    }
  } finally {
    await db.$client.end({ timeout: 0 })
  }

  const boss = createPgBoss(connectionString)
  try {
    logger.info({ stage: 'pgboss' }, 'starting pg-boss')
    await boss.start()
    await boss.stop()
  } catch (error) {
    logger.error({ stage: 'pgboss', error }, 'pg-boss start failed')
    throw error
  }

  logger.info({ stage: 'done' }, 'migrations complete')
}

export function isCliEntry(metaUrl: string, argv: ReadonlyArray<string>): boolean {
  const entry = argv[1]
  if (!entry) return false
  return metaUrl === pathToFileURL(entry).href
}

/* v8 ignore start */
if (isCliEntry(import.meta.url, process.argv)) {
  const config = loadConfig()
  runMigrations(config.DATABASE_URL).catch(() => {
    process.exitCode = 1
  })
}
/* v8 ignore stop */
