import { sql } from 'drizzle-orm'
import type { Database } from './client'

export async function probeDb(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`select 1`)
    return true
  } catch {
    return false
  }
}

export async function probePgBoss(db: Database): Promise<boolean> {
  try {
    const result = await db.execute<{ schema_name: string }>(
      sql`select schema_name from information_schema.schemata where schema_name = 'pgboss' limit 1`,
    )
    return result.length > 0
  } catch {
    return false
  }
}
