import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { signIn } from '../helpers/auth'

test.describe('US1 — auth gate & sign-in journey (FR-001, FR-004)', () => {
  test('unauthenticated visit to / redirects to /sign-in', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/')
    await expect(page).toHaveURL(/\/sign-in/)
  })

  test('/sign-in has no critical accessibility violations', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/sign-in')
    await page.waitForLoadState('domcontentloaded')
    const result = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
    const critical = result.violations.filter((v) => v.impact === 'critical')
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([])
  })

  test('sign in reaches the workspace; sign out returns to /sign-in', async ({ page }) => {
    await page.context().clearCookies()
    await signIn(page)
    // Authenticated: the account control (sign-out) is present.
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/sign-in/)
    // The workspace is locked again.
    await page.goto('/')
    await expect(page).toHaveURL(/\/sign-in/)
  })
})
