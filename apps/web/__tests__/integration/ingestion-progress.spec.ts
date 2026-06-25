import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { OWNER_CREDENTIALS, signInAs } from '../helpers/auth'

/**
 * Feature 002 — ingestion progress E2E (lifecycle + a11y).
 *
 * Runs only against the full stack with a seeded owner and `EMBEDDING_PROVIDER=
 * mock SUMMARY_GENERATOR=mock`; without that it is typecheck-validated only,
 * matching the existing US1/US2 E2E precedent.
 *
 * Scope note: the per-stage **stepper internals** (overall position, units,
 * elapsed/ETA, cached markers, friendly errors, resume wording) are proven
 * deterministically by the Vitest unit suite (`StageStepper`/`BookCard`/
 * `ingestion-messages`), the Testcontainers integration test, and live Playwright
 * validation (specs/002-ingestion-progress-tracking/baseline/after-*.png). With
 * mock providers a fresh ingestion can complete faster than the poll, so this E2E
 * asserts the deterministic, observable contract: the add→ingest→terminal
 * lifecycle renders, and the library view meets the project a11y bar.
 */

function newestCard(page: Page) {
  return page.locator('[data-slot="book-card"]').first()
}

test.describe('ingestion progress', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, OWNER_CREDENTIALS)
  })

  test('add → ingest → terminal lifecycle renders in the library', async ({ page }) => {
    await page.goto('/library')

    // Add a title from Gutendex; ingestion starts in the background.
    await page.getByRole('button', { name: 'Adicionar do Gutendex' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Adicionar do Gutendex' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Adicionar' }).first().click()
    await page.getByRole('button', { name: 'Close' }).click()

    // The newest card renders an ingestion status badge (role=status) and the
    // card settles on a terminal state (ready/failed) as the poll resolves —
    // proving the live status UI works end to end. While in progress the card
    // renders the StageStepper (its internals are unit/integration-tested).
    const card = newestCard(page)
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card.getByRole('status')).toBeVisible()
    await expect
      .poll(async () => card.getAttribute('data-status'), { timeout: 5 * 60 * 1000 })
      .toMatch(/ready|failed/)
  })

  test('the library view meets the project a11y bar (no critical violations, SC-008)', async ({
    page,
  }) => {
    await page.goto('/library')
    await expect(page.getByRole('heading', { name: 'Gerenciar acervo' })).toBeVisible()
    // Match the repo's established axe config (a11y/lighthouse.spec.ts): color
    // contrast is excluded project-wide; the bar is zero *critical* violations.
    const result = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
    const critical = result.violations.filter((v) => v.impact === 'critical')
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([])
  })
})
