import { type LaunchedChrome, launch as launchChrome } from 'chrome-launcher'
import lighthouse from 'lighthouse'
import {
  A11Y_LIGHTHOUSE_CONFIG,
  collectFailingAudits,
  DEFAULT_CHROME_FLAGS,
  type LighthouseAccessibilityAudit,
  type LighthouseAuditResult,
  type LighthouseFailingAudit,
} from './lighthouse-config'

export type { LighthouseAuditResult, LighthouseFailingAudit }

export interface LighthouseRunOptions {
  readonly url: string
}

interface LighthouseRunnerResult {
  readonly lhr: {
    readonly categories: { readonly accessibility?: { readonly score: number | null } }
    readonly audits: Readonly<Record<string, LighthouseAccessibilityAudit>>
  }
}

export async function runLighthouseA11y(
  options: LighthouseRunOptions,
): Promise<LighthouseAuditResult> {
  const chrome = await launchChromeForLighthouse()
  try {
    const config = A11Y_LIGHTHOUSE_CONFIG as unknown as Parameters<typeof lighthouse>[2]
    const flags = { port: chrome.port, output: 'json' as const, logLevel: 'error' as const }
    const result = (await lighthouse(options.url, flags, config)) as
      | LighthouseRunnerResult
      | undefined
    if (!result) throw new Error('Lighthouse returned no result.')
    const score = result.lhr.categories.accessibility?.score ?? 0
    const failingAudits = collectFailingAudits(result.lhr.audits)
    return { url: options.url, score, failingAudits }
  } finally {
    await chrome.kill()
  }
}

async function launchChromeForLighthouse(): Promise<LaunchedChrome> {
  return launchChrome({ chromeFlags: [...DEFAULT_CHROME_FLAGS] })
}
