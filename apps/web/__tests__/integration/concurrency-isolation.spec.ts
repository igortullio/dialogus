import { type BrowserContext, expect, test } from '@playwright/test'
import {
  type E2ECredentials,
  MEMBER_CREDENTIALS,
  OWNER_CREDENTIALS,
  signInAs,
} from '../helpers/auth'

/**
 * SC-006 (T062): ≥10 concurrent authenticated users exercise the workspace with
 * zero cross-user visibility and no errors.
 *
 * Concurrency is parameterized by the seeded-account credential list. CI seeds
 * ≥10 accounts and passes them via `E2E_CONCURRENT_USERS` (JSON array of
 * `{ email, password }`); locally it falls back to the two standard seeded
 * accounts (owner + member) as a representative subset. Like the other E2E
 * specs this is typecheck-validated here and executed in CI against the full
 * stack with `E2E_MOCK_LLM=1`. The "no perceptible degradation" aspect of SC-006
 * is a qualitative streaming-latency check noted below, not asserted.
 */
function concurrentUsers(): E2ECredentials[] {
  const raw = process.env.E2E_CONCURRENT_USERS
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as E2ECredentials[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch {
      // fall through to the default subset
    }
  }
  return [OWNER_CREDENTIALS, MEMBER_CREDENTIALS]
}

test.describe('SC-006 — concurrent multi-user isolation', () => {
  test('every concurrent user reaches their own private workspace with no cross-talk', async ({
    browser,
  }) => {
    const users = concurrentUsers()
    const contexts: BrowserContext[] = []
    try {
      // Each user is an independent browser context (== an independent device).
      const sessions = await Promise.all(
        users.map(async (creds) => {
          const context = await browser.newContext()
          contexts.push(context)
          const page = await context.newPage()
          await signInAs(page, creds)
          return { creds, page }
        }),
      )

      // All sign-ins succeeded concurrently → each lands in the gated workspace.
      for (const { page } of sessions) {
        await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
      }

      // Each user's thread list (server-scoped to their resourceId via the
      // authenticated proxy) contains only their own conversations — never
      // another user's. Fetched concurrently to exercise isolation under load.
      const threadLists = await Promise.all(
        sessions.map(async ({ creds, page }) => {
          const res = await page.request.get('/api/memory/threads')
          expect(res.ok(), `thread list for ${creds.email}`).toBeTruthy()
          const body = (await res.json()) as Array<{ id: string; resourceId?: string }>
          return { creds, threads: Array.isArray(body) ? body : [] }
        }),
      )

      // No thread id appears in more than one user's list (zero cross-visibility).
      const seen = new Map<string, string>()
      for (const { creds, threads } of threadLists) {
        for (const thread of threads) {
          const prior = seen.get(thread.id)
          expect(
            prior,
            `thread ${thread.id} visible to both ${prior} and ${creds.email}`,
          ).toBeUndefined()
          seen.set(thread.id, creds.email)
        }
      }
    } finally {
      await Promise.all(contexts.map((c) => c.close()))
    }
  })
})
