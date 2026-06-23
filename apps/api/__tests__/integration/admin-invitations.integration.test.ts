import { randomUUID } from 'node:crypto'
import { invitations, securityEvents, session, user } from '@dialogus/db/schema'
import type { DialogusEnv } from '@dialogus/shared/config'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { acceptInvitation, createInvitation } from '../../src/application/admin/invitations'
import { revokeMember, setMemberRole } from '../../src/application/admin/members'
import { createAuth } from '../../src/infrastructure/auth/auth'
import { createMemberAccount } from '../../src/infrastructure/auth/createAccount'
import { DrizzleAdminRepository } from '../../src/infrastructure/persistence/DrizzleAdminRepository'
import {
  createTestUser,
  dockerAvailable,
  type PostgresContext,
  startPostgres,
  stopPostgres,
} from './_helpers/setup'

const testConfig = {
  NODE_ENV: 'test',
  BETTER_AUTH_SECRET: 'test-secret-at-least-32-chars-long-xx',
  NEXT_PUBLIC_API_URL: 'http://localhost:3001',
  APP_URL: 'http://localhost:3000',
  WEB_ORIGIN: 'http://localhost:3000',
  AUTH_TRUSTED_ORIGINS: '',
  SESSION_MAX_AGE_SECONDS: 60 * 60 * 24 * 7,
  AUTH_RATE_LIMIT_SIGNIN_MAX: 5,
  LOG_LEVEL: 'silent',
} as unknown as DialogusEnv

function recordingEmail() {
  const sent: Array<{ to: string; subject: string; html: string; text?: string }> = []
  return {
    sent,
    provider: {
      async send(input: { to: string; subject: string; html: string; text?: string }) {
        sent.push(input)
      },
    },
  }
}

describe.skipIf(!dockerAvailable)(
  'US3 invite-only onboarding + access control (Testcontainers)',
  () => {
    let pg: PostgresContext
    let repo: DrizzleAdminRepository
    let auth: ReturnType<typeof createAuth>
    let adminId: string

    beforeAll(async () => {
      pg = await startPostgres()
      repo = new DrizzleAdminRepository(pg.db)
      auth = createAuth({
        db: pg.db,
        config: testConfig,
        emailProvider: { async send() {} },
        adminRepo: repo,
      })
    }, 180_000)

    afterAll(async () => {
      if (pg) await stopPostgres(pg)
    })

    beforeEach(async () => {
      await pg.db.delete(securityEvents)
      await pg.db.delete(invitations)
      await pg.db.delete(session)
      // Clear users between tests so admin counts don't accumulate (the
      // last-admin guard assumes a clean slate). Deleting `user` cascades to
      // `account`/`session` and SET NULLs the audit/invitation back-references.
      await pg.db.delete(user)
      // A clean admin to own invitations + satisfy the last-admin guard.
      adminId = await createTestUser(pg.db, {
        id: `admin-${randomUUID()}`,
        email: `admin-${randomUUID()}@test.local`,
        role: 'admin',
      })
    })

    function inviteDeps() {
      const email = recordingEmail()
      return {
        email,
        deps: {
          repo,
          email: email.provider,
          appUrl: testConfig.APP_URL,
        },
      }
    }

    function acceptDeps() {
      return {
        repo,
        createAccount: (input: { email: string; name: string; password: string }) =>
          createMemberAccount(auth, input),
      }
    }

    it('runs the full invitation state machine: pending → accepted (used), single-use enforced (FR-016)', async () => {
      const { email, deps } = inviteDeps()
      const invitation = await createInvitation(deps, {
        email: 'invitee@test.local',
        invitedBy: adminId,
      })
      expect(invitation.status).toBe('pending')
      // The invite email carries the accept-invite link.
      expect(email.sent).toHaveLength(1)
      expect(`${email.sent[0]?.html} ${email.sent[0]?.text}`).toContain(
        `/accept-invite?invitation=${invitation.id}`,
      )

      const { userId } = await acceptInvitation(acceptDeps(), {
        invitationId: invitation.id,
        name: 'Invitee',
        password: 'StrongPass123!',
      })
      expect(userId).toBeTruthy()

      // The invitation is consumed by the user.create hook (single-use).
      const consumed = await repo.findInvitationById(invitation.id)
      expect(consumed?.status).toBe('used')
      expect(consumed?.consumedByUserId).toBe(userId)

      // account_created was audited.
      const created = await pg.db
        .select()
        .from(securityEvents)
        .where(eq(securityEvents.eventType, 'account_created'))
      expect(created).toHaveLength(1)
      expect(created[0]?.userId).toBe(userId)

      // Re-accepting the now-used invitation is rejected (single-use).
      await expect(
        acceptInvitation(acceptDeps(), {
          invitationId: invitation.id,
          name: 'Again',
          password: 'StrongPass123!',
        }),
      ).rejects.toMatchObject({ code: 'INVITATION_INVALID' })
    })

    it('rejects an uninvited account creation and audits unauthorized_signup_attempt (FR-005/FR-014)', async () => {
      await expect(
        createMemberAccount(auth, {
          email: 'stranger@test.local',
          name: 'Stranger',
          password: 'StrongPass123!',
        }),
      ).rejects.toThrow()

      const events = await pg.db
        .select()
        .from(securityEvents)
        .where(eq(securityEvents.eventType, 'unauthorized_signup_attempt'))
      expect(events).toHaveLength(1)
      expect(events[0]?.email).toBe('stranger@test.local')
    })

    it('cannot accept an expired invitation', async () => {
      const [row] = await pg.db
        .insert(invitations)
        .values({
          email: 'late@test.local',
          invitedBy: adminId,
          status: 'pending',
          expiresAt: new Date(Date.now() - 60_000),
        })
        .returning()
      if (!row) throw new Error('failed to insert expired invitation')

      await expect(
        acceptInvitation(acceptDeps(), {
          invitationId: row.id,
          name: 'Late',
          password: 'StrongPass123!',
        }),
      ).rejects.toMatchObject({ code: 'INVITATION_INVALID' })
    })

    it('revoke = ban + session invalidation, audited as access_revoked (FR-015/SC-007)', async () => {
      const memberId = await createTestUser(pg.db, {
        id: `member-${randomUUID()}`,
        email: `member-${randomUUID()}@test.local`,
        role: 'member',
      })
      // Give the member a live session.
      await pg.db.insert(session).values({
        id: `sess-${randomUUID()}`,
        userId: memberId,
        token: `tok-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      })

      const result = await revokeMember({ repo }, memberId, { actorId: adminId })
      expect(result.banned).toBe(true)

      const remaining = await pg.db.select().from(session).where(eq(session.userId, memberId))
      expect(remaining).toHaveLength(0)

      const audit = await pg.db
        .select()
        .from(securityEvents)
        .where(
          and(eq(securityEvents.eventType, 'access_revoked'), eq(securityEvents.userId, memberId)),
        )
      expect(audit).toHaveLength(1)
    })

    it('refuses to revoke or demote the only administrator (last-admin safeguard, FR-017)', async () => {
      // `adminId` is the only admin in this clean DB.
      await expect(revokeMember({ repo }, adminId)).rejects.toMatchObject({ code: 'LAST_ADMIN' })
      await expect(setMemberRole({ repo }, adminId, 'member')).rejects.toMatchObject({
        code: 'LAST_ADMIN',
      })

      // A second admin lifts the safeguard.
      const secondAdmin = await createTestUser(pg.db, {
        id: `admin2-${randomUUID()}`,
        email: `admin2-${randomUUID()}@test.local`,
        role: 'admin',
      })
      const demoted = await setMemberRole({ repo }, adminId, 'member')
      expect(demoted.role).toBe('member')
      expect(secondAdmin).toBeTruthy()
    })
  },
)
