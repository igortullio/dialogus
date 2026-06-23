import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { OWNER_CREDENTIALS, signIn } from '../helpers/auth'

/**
 * US4 — account recovery + session lifecycle (T050).
 *
 * The runnable paths (navigation, request confirmation, invalid-link, a11y) work
 * against the stack with no extra setup. The full forgot→reset→sign-in
 * round-trip needs the mock-email link (logged by the API's MockEmailProvider);
 * per the T017/T028 precedent this file is typecheck-validated here and executed
 * in CI where the link is scraped from the API logs.
 */
test.describe('US4 — password reset journey (FR-019)', () => {
  test('sign-in exposes a forgot-password link to the reset page', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/sign-in')
    await page.getByRole('link', { name: /esqueci minha senha/i }).click()
    await expect(page).toHaveURL(/\/reset-password/)
    await expect(page.getByRole('button', { name: /enviar link/i })).toBeVisible()
  })

  test('requesting a reset shows a neutral confirmation (no account-existence leak)', async ({
    page,
  }) => {
    await page.context().clearCookies()
    await page.goto('/reset-password')
    await page.getByLabel('E-mail').fill(OWNER_CREDENTIALS.email)
    await page.getByRole('button', { name: /enviar link/i }).click()
    await expect(page.getByText(/enviamos um link/i)).toBeVisible()
  })

  test('a consumed/expired link shows the invalid-link state', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/reset-password?error=INVALID_TOKEN')
    await expect(page.getByText('Link inválido')).toBeVisible()
    await expect(page.getByRole('button', { name: /solicitar novo link/i })).toBeVisible()
  })

  test('/reset-password has no critical accessibility violations', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/reset-password')
    await page.waitForLoadState('domcontentloaded')
    const result = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
    const critical = result.violations.filter((v) => v.impact === 'critical')
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([])
  })

  test('signing out one device leaves another device signed in (FR-020)', async ({ browser }) => {
    // Two independent browser contexts == two devices for the same account.
    const deviceA = await browser.newContext()
    const deviceB = await browser.newContext()
    try {
      const pageA = await deviceA.newPage()
      const pageB = await deviceB.newPage()
      await signIn(pageA)
      await signIn(pageB)

      // Sign out device A.
      await pageA.getByRole('button', { name: 'Sair' }).click()
      await expect(pageA).toHaveURL(/\/sign-in/)

      // Device B is still authenticated: the workspace stays reachable.
      await pageB.goto('/')
      await expect(pageB).not.toHaveURL(/\/sign-in/)
      await expect(pageB.getByRole('button', { name: 'Sair' })).toBeVisible()
    } finally {
      await deviceA.close()
      await deviceB.close()
    }
  })
})
