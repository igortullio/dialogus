export interface LighthouseAccessibilityAudit {
  readonly id: string
  readonly title?: string
  readonly description?: string
  readonly score: number | null
}

export interface LighthouseFailingAudit {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly score: number | null
}

export interface LighthouseAuditResult {
  readonly url: string
  readonly score: number
  readonly failingAudits: readonly LighthouseFailingAudit[]
}

export const DEFAULT_CHROME_FLAGS: readonly string[] = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
]

export const A11Y_LIGHTHOUSE_CONFIG = {
  extends: 'lighthouse:default',
  settings: {
    onlyCategories: ['accessibility'],
    formFactor: 'desktop',
    screenEmulation: {
      mobile: false,
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
      disabled: false,
    },
    throttlingMethod: 'provided',
  },
} as const

export function collectFailingAudits(
  audits: Readonly<Record<string, LighthouseAccessibilityAudit>>,
): readonly LighthouseFailingAudit[] {
  const failing: LighthouseFailingAudit[] = []
  for (const [id, audit] of Object.entries(audits)) {
    if (audit.score === null) continue
    if (audit.score >= 1) continue
    failing.push({
      id,
      title: audit.title ?? id,
      description: audit.description ?? '',
      score: audit.score,
    })
  }
  return failing
}
