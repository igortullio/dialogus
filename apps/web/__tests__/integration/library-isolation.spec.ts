import { AxeBuilder } from '@axe-core/playwright'
import { type Browser, expect, type Page, test } from '@playwright/test'
import { MEMBER_CREDENTIALS, OWNER_CREDENTIALS, signInAs } from '../helpers/auth'

// US2 two-user isolation E2E (T028). Validates SC-002/SC-003/SC-008 end-to-end:
// libraries are per-user over the shared corpus, re-adding an already-ingested
// title is instant, and an account-scoped spoiler cap follows the user across
// "devices" (separate browser contexts).
//
// Runs only against the full stack with TWO seeded accounts (owner + member,
// see helpers/auth `*_CREDENTIALS`) and `E2E_MOCK_LLM=1`; without that it is
// typecheck-validated only, matching the US1 E2E precedent. Lives under
// __tests__/integration so the existing Playwright `integration` project picks
// it up (there is no separate `e2e` project wired today).

const BRAS_CUBAS_GUTENDEX_ID = 54829
const INGEST_TIMEOUT_MS = 10 * 60 * 1000
const STREAM_COMPLETION_TIMEOUT_MS = 60 * 1000

function onboardingCard(page: Page) {
  return page.locator(
    `[data-slot="onboarding-book-card"][data-gutendex-id="${BRAS_CUBAS_GUTENDEX_ID}"]`,
  )
}

/** Add Brás Cubas from the onboarding screen (the deterministic curated title). */
async function addBrasCubas(page: Page): Promise<void> {
  await page.goto('/')
  const card = onboardingCard(page)
  await expect(card).toBeVisible()
  await card.locator('[data-slot="onboarding-add-button"]').click()
}

function libraryCard(page: Page) {
  // The library grid keys cards by the shared book uuid (data-book-id); match by
  // the rendered title instead, which is stable across users for one corpus.
  return page.locator('[data-slot="book-card"]', {
    has: page.locator('[data-slot="book-card-title"]', { hasText: /Brás Cubas/i }),
  })
}

async function gotoLibrary(page: Page): Promise<void> {
  await page.goto('/library')
  await expect(page.locator('[data-slot="library-page"]')).toBeVisible()
}

test.describe('US2 — two-user library isolation', () => {
  test('libraries are per-user over the shared corpus, and re-add is instant', async ({
    browser,
  }: {
    browser: Browser
  }) => {
    const ownerCtx = await browser.newContext()
    const memberCtx = await browser.newContext()
    try {
      const owner = await ownerCtx.newPage()
      const member = await memberCtx.newPage()

      // Owner signs in and adds Brás Cubas to their library.
      await signInAs(owner, OWNER_CREDENTIALS)
      await addBrasCubas(owner)
      await gotoLibrary(owner)
      await expect(libraryCard(owner)).toBeVisible({
        timeout: INGEST_TIMEOUT_MS,
      })

      // Member signs in: their library does NOT contain the owner's title (SC-002).
      await signInAs(member, MEMBER_CREDENTIALS)
      await gotoLibrary(member)
      await expect(libraryCard(member)).toHaveCount(0)

      // Member adds the SAME title: it reuses the shared corpus and appears
      // immediately (membership is instant; no second ingestion — SC-003/004).
      await addBrasCubas(member)
      await gotoLibrary(member)
      await expect(libraryCard(member)).toBeVisible({ timeout: 15_000 })

      // Owner still has it: a member's add never disturbs another user's library.
      await gotoLibrary(owner)
      await expect(libraryCard(owner)).toBeVisible()
    } finally {
      await ownerCtx.close()
      await memberCtx.close()
    }
  })

  test('an account-scoped spoiler cap persists across devices', async ({
    browser,
  }: {
    browser: Browser
  }) => {
    const deviceOneCtx = await browser.newContext()
    const deviceTwoCtx = await browser.newContext()
    try {
      const deviceOne = await deviceOneCtx.newPage()

      // Device 1: ensure the owner has a ready book, open a thread on it, set a cap.
      await signInAs(deviceOne, OWNER_CREDENTIALS)
      await addBrasCubas(deviceOne)
      await deviceOne.goto('/')
      await expect(onboardingCard(deviceOne)).toHaveAttribute('data-phase', 'ready', {
        timeout: INGEST_TIMEOUT_MS,
      })

      const bookId = await openThreadOnReadyBook(deviceOne)
      const cap = 3
      await setSpoilerCap(deviceOne, bookId, cap)

      // Device 2: a fresh context for the SAME owner sees the cap on the shared
      // book — the cap is account-scoped (FR-008/SC-008), not per-device.
      const deviceTwo = await deviceTwoCtx.newPage()
      await signInAs(deviceTwo, OWNER_CREDENTIALS)
      const sameBookId = await openThreadOnReadyBook(deviceTwo)
      expect(sameBookId).toBe(bookId)
      const chip = deviceTwo.locator(`[data-slot="thread-header-chip"][data-book-id="${bookId}"]`)
      await expect(chip).toHaveAttribute('data-cap', String(cap), { timeout: 10_000 })
    } finally {
      await deviceOneCtx.close()
      await deviceTwoCtx.close()
    }
  })

  test('/library has no critical accessibility violations', async ({ page }: { page: Page }) => {
    await signInAs(page, OWNER_CREDENTIALS)
    await gotoLibrary(page)
    const result = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
    const critical = result.violations.filter((v) => v.impact === 'critical')
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([])
  })
})

/** Start a new thread bound to the first ready book and return its book id. */
async function openThreadOnReadyBook(page: Page): Promise<string> {
  await page.goto('/')
  await page.locator('[data-slot="thread-sidebar-new"]').first().click()
  await page.locator('[data-slot="book-picker-trigger"]').click()
  const popover = page.locator('[data-slot="book-picker-content"]')
  await expect(popover).toBeVisible()
  const candidate = popover.locator('[data-book-id]').first()
  const bookId = await candidate.getAttribute('data-book-id')
  if (bookId === null) throw new Error('no ready book available in the BookPicker')
  await candidate.click()
  await page.keyboard.press('Escape')

  // The thread header chip only renders once the thread exists (first send).
  const input = page.locator('[data-slot="dialogus-composer"] textarea')
  await input.fill('Olá')
  await page.locator('[data-slot="dialogus-composer-send"]').click()
  await expect(
    page.locator('[data-slot="dialogus-message-row"][data-role="assistant"]').last(),
  ).toBeVisible({ timeout: STREAM_COMPLETION_TIMEOUT_MS })
  await expect(
    page.locator(`[data-slot="thread-header-chip"][data-book-id="${bookId}"]`),
  ).toBeVisible({ timeout: 10_000 })
  return bookId
}

/** Open the book chip popover and set the spoiler cap to `cap` via the slider. */
async function setSpoilerCap(page: Page, bookId: string, cap: number): Promise<void> {
  const chip = page.locator(`[data-slot="thread-header-chip"][data-book-id="${bookId}"]`)
  await chip.click()
  const popover = page.locator('[data-slot="thread-header-popover"]')
  await expect(popover).toBeVisible()
  const slider = popover.locator('[role="slider"]').first()
  await slider.focus()
  // Drive the readout down to the target with arrow keys (debounced PUT to the API).
  for (let i = 0; i < 300; i += 1) {
    await page.keyboard.press('ArrowDown')
  }
  const readout = popover.locator('[data-slot="thread-header-cap-readout"]')
  await expect.poll(async () => (await readout.textContent())?.trim()).toBe('1')
  for (let i = 1; i < cap; i += 1) {
    await page.keyboard.press('ArrowUp')
  }
  await expect.poll(async () => (await readout.textContent())?.trim()).toBe(String(cap))
  await page.keyboard.press('Escape')
  await expect(chip).toHaveAttribute('data-cap', String(cap), { timeout: 10_000 })
}
