import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').primaryKey(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idempotency_keys_created_at_idx').on(table.createdAt)],
)
