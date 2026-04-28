import { describe, expect, it } from 'vitest'
import {
  A11Y_LIGHTHOUSE_CONFIG,
  collectFailingAudits,
  DEFAULT_CHROME_FLAGS,
} from './helpers/lighthouse-config'

describe('lighthouse-runner helper', () => {
  it('only runs the accessibility category, in headless desktop form factor', () => {
    expect(A11Y_LIGHTHOUSE_CONFIG.extends).toBe('lighthouse:default')
    expect(A11Y_LIGHTHOUSE_CONFIG.settings.onlyCategories).toEqual(['accessibility'])
    expect(A11Y_LIGHTHOUSE_CONFIG.settings.formFactor).toBe('desktop')
    expect(A11Y_LIGHTHOUSE_CONFIG.settings.screenEmulation.mobile).toBe(false)
    expect(A11Y_LIGHTHOUSE_CONFIG.settings.throttlingMethod).toBe('provided')
  })

  it('uses the deterministic Chrome flags expected for CI sandboxes', () => {
    expect(DEFAULT_CHROME_FLAGS).toContain('--headless=new')
    expect(DEFAULT_CHROME_FLAGS).toContain('--no-sandbox')
    expect(DEFAULT_CHROME_FLAGS).toContain('--disable-gpu')
    expect(DEFAULT_CHROME_FLAGS).toContain('--disable-dev-shm-usage')
  })

  it('collectFailingAudits returns audits with score < 1 and skips informational nulls', () => {
    const failing = collectFailingAudits({
      'aria-roles': { id: 'aria-roles', title: 'Roles', score: 1 },
      'color-contrast': {
        id: 'color-contrast',
        title: 'Contrast',
        description: 'Use proper contrast.',
        score: 0.5,
      },
      heading: { id: 'heading', title: 'Heading', score: null },
      'tap-targets': { id: 'tap-targets', title: 'Targets', score: 0 },
    })
    const ids = failing.map((audit) => audit.id)
    expect(ids).toEqual(['color-contrast', 'tap-targets'])
  })
})
