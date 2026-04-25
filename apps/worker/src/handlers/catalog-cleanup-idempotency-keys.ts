import type { Database } from '@dialogus/db'
import type { Job } from '@dialogus/db/pgboss'
import { idempotencyKeys } from '@dialogus/db/schema'
import { lt, sql } from 'drizzle-orm'
import type { Logger } from 'pino'

export const CLEANUP_IDEMPOTENCY_KEYS_JOB = 'catalog.cleanup-idempotency-keys'
export const CLEANUP_IDEMPOTENCY_KEYS_CRON = '0 * * * *'

export interface CleanupIdempotencyKeysResult {
  deleted: number
}

export interface CleanupIdempotencyKeysDeps {
  db: Database
  logger?: Logger
}

export async function runCleanupIdempotencyKeys(
  deps: CleanupIdempotencyKeysDeps,
): Promise<CleanupIdempotencyKeysResult> {
  const rows = await deps.db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.createdAt, sql`now() - interval '24 hours'`))
    .returning({ key: idempotencyKeys.key })
  const deleted = rows.length
  deps.logger?.info(
    { job: CLEANUP_IDEMPOTENCY_KEYS_JOB, deleted },
    'idempotency keys cleanup complete',
  )
  return { deleted }
}

export function createCleanupIdempotencyKeysHandler(
  deps: CleanupIdempotencyKeysDeps,
): (jobs: Job<unknown>[]) => Promise<CleanupIdempotencyKeysResult> {
  return async () => runCleanupIdempotencyKeys(deps)
}
