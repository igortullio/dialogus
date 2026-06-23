import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'

// Owner-controlled allowlist (feature 001-multi-user-auth, US3 — FR-014, FR-016).
// One row per invited email. The `user.create.before` allowlist hook gates
// account creation on an `open` invitation (status='pending' AND not expired);
// the partial UNIQUE(email) WHERE status='pending' guarantees at most one live
// invite per email. State machine: pending → used (account created) | revoked
// (owner) | expired (past expires_at). `invited_by`/`consumed_by_user_id` are
// `text` (Better Auth user PK) and SET NULL on user deletion so audit history
// survives account removal (FR-023).
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    email: text('email').notNull(),
    status: text('status', { enum: ['pending', 'used', 'expired', 'revoked'] })
      .notNull()
      .default('pending'),
    invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
    consumedByUserId: text('consumed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // At most one live invitation per email (FR-016).
    uniqueIndex('invitations_email_pending_unique')
      .on(table.email)
      .where(sql`${table.status} = 'pending'`),
    // Listing the owner's invitations newest-first with cursor pagination.
    index('invitations_created_at_id_idx').on(table.createdAt.desc(), table.id.desc()),
  ],
)
