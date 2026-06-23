import { expect, type Locator, type Page, test } from '@playwright/test'
import { signIn } from '../helpers/auth'

const BRAS_CUBAS_GUTENDEX_ID = 54829
const INGEST_TIMEOUT_MS = 10 * 60 * 1000
const STREAM_COMPLETION_TIMEOUT_MS = 60 * 1000
const RENAMED_THREAD_TITLE = 'Memorias deep dive'

async function waitForBookReady(page: Page): Promise<void> {
  const card = page.locator(
    `[data-slot="onboarding-book-card"][data-gutendex-id="${BRAS_CUBAS_GUTENDEX_ID}"]`,
  )
  await expect(card).toBeVisible()
  await expect(card).toHaveAttribute('data-phase', 'ready', { timeout: INGEST_TIMEOUT_MS })
}

async function clickAddBrasCubas(page: Page): Promise<void> {
  const card = page.locator(
    `[data-slot="onboarding-book-card"][data-gutendex-id="${BRAS_CUBAS_GUTENDEX_ID}"]`,
  )
  await card.locator('[data-slot="onboarding-add-button"]').click()
}

async function startNewThread(page: Page): Promise<void> {
  await page.locator('[data-slot="thread-sidebar-new"]').first().click()
}

async function selectBrasCubas(page: Page, bookId: string): Promise<void> {
  await page.locator('[data-slot="book-picker-trigger"]').click()
  const popover = page.locator('[data-slot="book-picker-content"]')
  await expect(popover).toBeVisible()
  await popover.locator(`[data-book-id="${bookId}"]`).click()
  await page.keyboard.press('Escape')
}

async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.locator('[data-slot="dialogus-composer"] textarea')
  await input.fill(text)
  await page.locator('[data-slot="dialogus-composer-send"]').click()
}

async function waitForAssistantMessageReady(page: Page): Promise<Locator> {
  const lastAssistant = page
    .locator('[data-slot="dialogus-message-row"][data-role="assistant"]')
    .last()
  await expect(lastAssistant).toBeVisible({ timeout: STREAM_COMPLETION_TIMEOUT_MS })
  await expect
    .poll(async () => page.locator('[data-slot="dialogus-composer-cancel"]').count(), {
      timeout: STREAM_COMPLETION_TIMEOUT_MS,
    })
    .toBe(0)
  return lastAssistant
}

async function findFirstReadyBookId(page: Page): Promise<string> {
  await page.locator('[data-slot="book-picker-trigger"]').click()
  const popover = page.locator('[data-slot="book-picker-content"]')
  await expect(popover).toBeVisible()
  const candidate = popover.locator('[data-book-id]').first()
  const id = await candidate.getAttribute('data-book-id')
  if (id === null) throw new Error('No ready book found in BookPicker.')
  await page.keyboard.press('Escape')
  return id
}

async function readActiveThreadId(page: Page): Promise<string> {
  const threadId = await page.evaluate(() => {
    const row = document.querySelector('[data-slot="thread-row"][data-active="true"]')
    return row?.getAttribute('data-thread-id') ?? null
  })
  if (typeof threadId !== 'string' || threadId.length === 0) {
    throw new Error('No active thread row found in sidebar.')
  }
  return threadId
}

test.describe('Feature 004 — chat-first happy path', () => {
  test('search → ingest → ask → spoiler-safe read → rename → pin → delete', async ({ page }) => {
    // Auth gate (FR-001): sign in before the workspace is reachable.
    await signIn(page)

    await test.step('1. Land on / and see Primeiros passos', async () => {
      const card = page.locator('[data-slot="empty-state-card"][data-state="onboarding"]')
      await expect(card).toBeVisible()
      await expect(card).toContainText('Primeiros passos')
    })

    await test.step('2. Add and ingest Brás Cubas', async () => {
      await clickAddBrasCubas(page)
      await waitForBookReady(page)
    })

    await test.step('3. Open Nova conversa and verify Brás Cubas is offered', async () => {
      await startNewThread(page)
      await page.locator('[data-slot="book-picker-trigger"]').click()
      const popover = page.locator('[data-slot="book-picker-content"]')
      await expect(popover).toBeVisible()
      await expect(popover).toContainText('Memórias Póstumas')
      await page.keyboard.press('Escape')
    })

    let firstThreadBookId = ''
    await test.step('4. Select Brás Cubas, ask the narrator question, verify badge', async () => {
      firstThreadBookId = await findFirstReadyBookId(page)
      await selectBrasCubas(page, firstThreadBookId)
      await sendMessage(page, 'quem é o narrador?')
      const assistant = await waitForAssistantMessageReady(page)
      const badges = assistant.locator('[data-slot="citation-badge"]')
      await expect(badges.first()).toBeVisible()
      const badgeAria = await badges.first().locator('button').getAttribute('aria-label')
      expect(badgeAria ?? '').toMatch(/Citação \d+/)
    })

    let activeThreadId = ''
    await test.step('5. Click the badge and verify side panel chapter context', async () => {
      activeThreadId = await readActiveThreadId(page)
      const lastAssistant = page
        .locator('[data-slot="dialogus-message-row"][data-role="assistant"]')
        .last()
      await lastAssistant.locator('[data-slot="citation-badge"] button').first().click()
      const panel = page.locator('[data-slot="citation-side-panel"][data-panel-kind="chunk"]')
      await expect(panel).toBeVisible()
      const content = panel.locator('[data-slot="citation-side-panel-content"]')
      await expect(content).toBeVisible()
      await expect(content).toContainText(/Cap\. \d+/)
      await page.keyboard.press('Escape')
    })

    await test.step('6. Set spoiler cap to chapter 3 and verify follow-up answer respects cap', async () => {
      const chip = page.locator(
        `[data-slot="thread-header-chip"][data-book-id="${firstThreadBookId}"]`,
      )
      await chip.click()
      const popover = page.locator('[data-slot="thread-header-popover"]')
      await expect(popover).toBeVisible()
      const slider = popover
        .locator(
          '[data-slot="thread-header-slider"] [role="slidebar"], [data-slot="thread-header-slider"] [role="slider"]',
        )
        .first()
      await slider.focus()
      for (let i = 0; i < 200; i += 1) {
        await page.keyboard.press('ArrowDown')
      }
      const readout = popover.locator('[data-slot="thread-header-cap-readout"]')
      await expect.poll(async () => (await readout.textContent())?.trim()).toBe('1')
      for (let i = 0; i < 2; i += 1) {
        await page.keyboard.press('ArrowUp')
      }
      await expect.poll(async () => (await readout.textContent())?.trim()).toBe('3')
      await page.keyboard.press('Escape')
      await expect(chip).toHaveAttribute('data-cap', '3', { timeout: 5_000 })
      await sendMessage(page, 'o que acontece no capítulo 5?')
      const assistant = await waitForAssistantMessageReady(page)
      const badgeChapters = await assistant.evaluate((el) => {
        const badges = Array.from(
          el.querySelectorAll('[data-slot="citation-badge"] button[aria-label]'),
        )
        return badges
          .map((b) => b.getAttribute('aria-label') ?? '')
          .map((label) => /capítulo (\d+)/i.exec(label)?.[1] ?? null)
          .filter((value): value is string => value !== null)
          .map((value) => Number.parseInt(value, 10))
      })
      for (const ordinal of badgeChapters) {
        expect(ordinal).toBeLessThanOrEqual(3)
      }
    })

    await test.step('7. Rename the thread and verify persistence after refresh', async () => {
      const row = page.locator(`[data-slot="thread-row"][data-thread-id="${activeThreadId}"]`)
      await row.locator('[data-slot="thread-row-menu-trigger"]').click()
      await page.locator('[data-slot="thread-row-rename"]').click()
      const input = page.locator('[data-slot="thread-row-rename-input"]')
      await expect(input).toBeVisible()
      await input.fill(RENAMED_THREAD_TITLE)
      await input.press('Enter')
      await expect(row).toContainText(RENAMED_THREAD_TITLE)
      await page.reload()
      const refreshed = page.locator(`[data-slot="thread-row"][data-thread-id="${activeThreadId}"]`)
      await expect(refreshed).toContainText(RENAMED_THREAD_TITLE)
    })

    await test.step('8. Pin the thread and verify pinned group after refresh', async () => {
      const row = page.locator(`[data-slot="thread-row"][data-thread-id="${activeThreadId}"]`)
      await row.locator('[data-slot="thread-row-menu-trigger"]').click()
      await page.locator('[data-slot="thread-row-pin"]').click()
      await expect(row).toHaveAttribute('data-pinned', 'true', { timeout: 10_000 })
      await page.reload()
      const refreshed = page.locator(`[data-slot="thread-row"][data-thread-id="${activeThreadId}"]`)
      await expect(refreshed).toHaveAttribute('data-pinned', 'true', { timeout: 10_000 })
      const pinnedGroup = page.locator('[data-slot="thread-sidebar-pinned"]')
      await expect(pinnedGroup).toContainText(RENAMED_THREAD_TITLE)
    })

    let secondThreadId = ''
    await test.step('9. Create a second thread, then delete it', async () => {
      await startNewThread(page)
      await selectBrasCubas(page, firstThreadBookId)
      await sendMessage(page, 'segunda conversa de teste')
      await waitForAssistantMessageReady(page)
      secondThreadId = await readActiveThreadId(page)
      const row = page.locator(`[data-slot="thread-row"][data-thread-id="${secondThreadId}"]`)
      await row.locator('[data-slot="thread-row-menu-trigger"]').click()
      await page.locator('[data-slot="thread-row-delete"]').click()
      await page.locator('[data-slot="thread-row-delete-confirm"]').click()
      await expect(row).toHaveCount(0, { timeout: 10_000 })
    })
  })
})
