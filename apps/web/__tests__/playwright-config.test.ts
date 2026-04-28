import { afterEach, describe, expect, it } from 'vitest'

interface PlaywrightProject {
  readonly name?: string
  readonly testDir?: string
  readonly testMatch?: RegExp | string | RegExp[] | string[]
  readonly timeout?: number
}

interface PlaywrightWebServer {
  readonly command?: string
  readonly url?: string
  readonly reuseExistingServer?: boolean
  readonly timeout?: number
}

interface PlaywrightConfigShape {
  readonly testDir?: string
  readonly fullyParallel?: boolean
  readonly forbidOnly?: boolean
  readonly retries?: number
  readonly workers?: number
  readonly reporter?: unknown
  readonly use?: { readonly baseURL?: string; readonly trace?: string }
  readonly projects?: readonly PlaywrightProject[]
  readonly webServer?: PlaywrightWebServer | undefined
}

async function loadConfig(): Promise<PlaywrightConfigShape> {
  const mod = await import('../playwright.config')
  return (mod.default as PlaywrightConfigShape) ?? (mod as PlaywrightConfigShape)
}

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('playwright.config.ts', () => {
  it('declares the integration and a11y projects with restricted testDirs', async () => {
    const config = await loadConfig()
    expect(config.projects).toBeDefined()
    const projects = config.projects ?? []
    const names = projects.map((p) => p.name)
    expect(names).toContain('integration')
    expect(names).toContain('a11y')
    const integration = projects.find((p) => p.name === 'integration')
    const a11y = projects.find((p) => p.name === 'a11y')
    expect(integration?.testDir).toBe('./__tests__/integration')
    expect(a11y?.testDir).toBe('./__tests__/a11y')
  })

  it('budgets the integration timeout to <= 15 minutes (PRD wall-clock cap is 10 min)', async () => {
    const config = await loadConfig()
    const integration = (config.projects ?? []).find((p) => p.name === 'integration')
    expect(integration?.timeout).toBeLessThanOrEqual(15 * 60 * 1000)
  })

  it('budgets the a11y timeout to <= 5 minutes', async () => {
    const config = await loadConfig()
    const a11y = (config.projects ?? []).find((p) => p.name === 'a11y')
    expect(a11y?.timeout).toBeLessThanOrEqual(5 * 60 * 1000)
  })

  it('matches only .spec.ts files (so vitest .test.ts files are excluded)', async () => {
    const config = await loadConfig()
    for (const project of config.projects ?? []) {
      const match = project.testMatch
      expect(match).toBeDefined()
      const re = match instanceof RegExp ? match : new RegExp(String(match))
      expect(re.test('happy-path.spec.ts')).toBe(true)
      expect(re.test('component.test.ts')).toBe(false)
    }
  })

  it('targets http://localhost:3000 by default', async () => {
    const config = await loadConfig()
    expect(config.use?.baseURL).toBe('http://localhost:3000')
  })

  it('configures webServer to start pnpm dev when not disabled', async () => {
    const config = await loadConfig()
    const ws = config.webServer
    expect(ws).toBeDefined()
    expect(ws?.command).toContain('@dialogus/web')
    expect(ws?.command).toContain('dev')
  })
})
