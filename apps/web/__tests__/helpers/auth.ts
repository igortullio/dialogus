import { expect, type Page } from '@playwright/test'

export interface E2ECredentials {
  readonly email: string
  readonly password: string
}

/** The seeded owner (admin). Used by every single-user spec. */
export const OWNER_CREDENTIALS: E2ECredentials = {
  email: process.env.E2E_OWNER_EMAIL ?? 'owner@dialogus.test',
  password: process.env.E2E_OWNER_PASSWORD ?? 'OwnerPass123!',
}

/**
 * A second seeded account (a non-owner member) for two-user isolation specs.
 * Seed it alongside the owner, e.g.
 * `pnpm --filter @dialogus/api seed:owner -- --email member@dialogus.test --password 'MemberPass123!'`.
 */
export const MEMBER_CREDENTIALS: E2ECredentials = {
  email: process.env.E2E_MEMBER_EMAIL ?? 'member@dialogus.test',
  password: process.env.E2E_MEMBER_PASSWORD ?? 'MemberPass123!',
}

/**
 * Signs in through the UI as the given account and waits until the gated
 * workspace is reachable. Requires a seeded account and the API running.
 */
export async function signInAs(page: Page, credentials: E2ECredentials): Promise<void> {
  await page.goto('/sign-in')
  await page.getByLabel('E-mail').fill(credentials.email)
  await page.getByLabel('Senha').fill(credentials.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
}

/** Signs in as the seeded owner (the default single-user journey). */
export async function signIn(page: Page): Promise<void> {
  await signInAs(page, OWNER_CREDENTIALS)
}

/** Serializes the current context cookies into a `Cookie` header value. */
export async function cookieHeader(page: Page): Promise<string> {
  const cookies = await page.context().cookies()
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}
