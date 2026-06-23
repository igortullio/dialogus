import { expect, type Page } from '@playwright/test'

const EMAIL = process.env.E2E_OWNER_EMAIL ?? 'owner@dialogus.test'
const PASSWORD = process.env.E2E_OWNER_PASSWORD ?? 'OwnerPass123!'

/**
 * Signs in through the UI and waits until the gated workspace is reachable.
 * Requires a seeded account (see `pnpm --filter @dialogus/api seed:owner`) and
 * the API running. Credentials come from E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto('/sign-in')
  await page.getByLabel('E-mail').fill(EMAIL)
  await page.getByLabel('Senha').fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
}

/** Serializes the current context cookies into a `Cookie` header value. */
export async function cookieHeader(page: Page): Promise<string> {
  const cookies = await page.context().cookies()
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}
