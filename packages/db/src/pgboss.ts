import { PgBoss } from 'pg-boss'

export function createPgBoss(connectionString: string): PgBoss {
  return new PgBoss(connectionString)
}

export type { Job, WorkHandler } from 'pg-boss'
export type { PgBoss }
