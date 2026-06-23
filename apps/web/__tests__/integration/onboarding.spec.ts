import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { MEMBER_CREDENTIALS, OWNER_CREDENTIALS, signInAs } from '../helpers/auth'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/**
 * US3 — invite-only onboarding + access control (T041).
 *
 * Exercises the owner/admin console and the accept-invite journey. The full
 * round-trip (invite → accept → sign-in) needs the whole stack running plus the
 * seeded owner + member (per the T017/T028 precedent these specs are
 * typecheck-validated here and executed in CI with `E2E_MOCK_LLM=1`).
 */
test.describe('US3 — invite-only onboarding (FR-014..FR-017)', () => {
  test('an admin can invite an email and see it listed as pending', async ({ page }) => {
    await page.context().clearCookies()
    await signInAs(page, OWNER_CREDENTIALS)

    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Administração' })).toBeVisible()

    const invitee = `invitee+${Date.now()}@dialogus.test`
    await page.getByLabel('E-mail').fill(invitee)
    await page.getByRole('button', { name: 'Convidar' }).click()

    await expect(page.getByText(invitee)).toBeVisible()
    await expect(page.getByText('pending')).toBeVisible()
  })

  test('/admin has no critical accessibility violations', async ({ page }) => {
    await page.context().clearCookies()
    await signInAs(page, OWNER_CREDENTIALS)
    await page.goto('/admin')
    await page.waitForLoadState('domcontentloaded')

    const result = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
    const critical = result.violations.filter((v) => v.impact === 'critical')
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([])
  })

  test('a non-admin member is redirected away from /admin', async ({ page }) => {
    await page.context().clearCookies()
    await signInAs(page, MEMBER_CREDENTIALS)

    await page.goto('/admin')
    // The server gate sends non-admins home.
    await expect(page).toHaveURL((url) => !url.pathname.startsWith('/admin'))
  })

  test('an invalid accept-invite token shows a friendly error', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/accept-invite?invitation=00000000-0000-4000-8000-000000000000')
    await expect(page.getByText(/convite inválido/i)).toBeVisible()
  })

  test('full round-trip: invite → accept → sign-in lands in the workspace', async ({ page }) => {
    await page.context().clearCookies()
    await signInAs(page, OWNER_CREDENTIALS)

    // Invite via the admin console.
    const invitee = `roundtrip+${Date.now()}@dialogus.test`
    await page.goto('/admin')
    await page.getByLabel('E-mail').fill(invitee)
    await page.getByRole('button', { name: 'Convidar' }).click()
    await expect(page.getByText(invitee)).toBeVisible()

    // Resolve the invitation id (the accept token) via the admin API using the
    // owner's session cookies (the mock email logs this same link in CI).
    const listing = await page.request.get(`${API_BASE}/api/admin/invitations?status=pending`)
    const body = (await listing.json()) as { data: Array<{ id: string; email: string }> }
    const invitation = body.data.find((i) => i.email === invitee)
    expect(invitation, 'pending invitation should exist').toBeTruthy()

    // Accept the invite as the new user, in a clean context.
    await page.context().clearCookies()
    await page.goto(`/accept-invite?invitation=${invitation?.id}`)
    await expect(page.getByText(invitee)).toBeVisible()
    await page.getByLabel('Nome').fill('Round Trip')
    await page.getByLabel('Senha').fill('RoundTripPass123!')
    await page.getByRole('button', { name: /criar conta/i }).click()

    // Account provisioned + auto signed-in → workspace reachable.
    await page.waitForURL((url) => !url.pathname.startsWith('/accept-invite'), { timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
  })
})
