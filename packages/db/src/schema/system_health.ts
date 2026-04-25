import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const systemHealth = pgTable('system_health', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  status: text('status').notNull().default('ok'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
