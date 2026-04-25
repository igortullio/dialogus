import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Database = ReturnType<typeof drizzle<typeof schema>>

export function createDatabase(connectionString: string): Database {
  const queryClient = postgres(connectionString)
  return drizzle(queryClient, { schema })
}
