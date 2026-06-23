import { sql } from 'drizzle-orm'
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'

// Append-only security/audit log (feature 001-multi-user-auth, US3 — FR-005).
// Records account_created · sign_in · sign_in_failed · access_revoked ·
// unauthorized_signup_attempt · rate_limited. `user_id`/`email` are nullable so
// anonymous/unauthorized attempts (no account) are still auditable; `user_id`
// is SET NULL on account deletion to anonymize history while preserving the
// event (FR-023). Never updated after insert.
export const securityEvents = pgTable(
  'security_events',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    email: text('email'),
    eventType: text('event_type', {
      enum: [
        'account_created',
        'sign_in',
        'sign_in_failed',
        'access_revoked',
        'unauthorized_signup_attempt',
        'rate_limited',
      ],
    }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('security_events_user_id_idx').on(table.userId),
    index('security_events_type_created_at_idx').on(table.eventType, table.createdAt.desc()),
  ],
)
