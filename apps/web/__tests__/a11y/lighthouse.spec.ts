import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { LighthouseAuditResult } from '../helpers/lighthouse-config'
import { runLighthouseA11y } from '../helpers/lighthouse-runner'

const A11Y_SCORE_FLOOR = 0.9
const ROUTES_TO_AUDIT: ReadonlyArray<{ readonly path: string; readonly label: string }> = [
  { path: '/', label: 'chat-first landing' },
  { path: '/library', label: 'library page' },
]

test.describe('Feature 004 — accessibility audits', () => {
  test('axe-core: chat-first landing has no critical violations', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const result = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
    const critical = result.violations.filter((v) => v.impact === 'critical')
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([])
  })

  test('axe-core: library page has no critical violations', async ({ page }) => {
    await page.goto('/library')
    await page.waitForLoadState('domcontentloaded')
    const result = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
    const critical = result.violations.filter((v) => v.impact === 'critical')
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([])
  })

  for (const route of ROUTES_TO_AUDIT) {
    test(`lighthouse a11y score >= ${A11Y_SCORE_FLOOR * 100} on ${route.label}`, async ({
      browser,
    }) => {
      test.skip(
        process.env.PLAYWRIGHT_SKIP_LIGHTHOUSE === '1',
        'Lighthouse run skipped via PLAYWRIGHT_SKIP_LIGHTHOUSE=1',
      )
      const url = `${process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'}${route.path}`
      const audit: LighthouseAuditResult = await runLighthouseA11y({ url })
      expect(audit.score).toBeGreaterThanOrEqual(A11Y_SCORE_FLOOR)
      expect(audit.failingAudits, JSON.stringify(audit.failingAudits, null, 2)).toEqual([])
      // Browser fixture is unused — Lighthouse launches its own Chrome instance.
      expect(browser).toBeDefined()
    })
  }
})
