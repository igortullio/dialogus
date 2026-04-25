import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const repoRoot = join(__dirname, '..')
const workflowPath = join(repoRoot, '.github', 'workflows', 'ci.yml')

type Step = {
  uses?: string
  name?: string
  run?: string
  with?: Record<string, unknown>
}

type Job = {
  'runs-on'?: string
  needs?: string | string[]
  services?: Record<string, unknown>
  steps?: Step[]
  'timeout-minutes'?: number
}

type Workflow = {
  name?: string
  on?: Record<string, { branches?: string[] } | null>
  concurrency?: {
    group?: string
    'cancel-in-progress'?: boolean | string
  }
  jobs?: Record<string, Job>
}

const raw = readFileSync(workflowPath, 'utf8')
const workflow = parseYaml(raw) as Workflow

describe('.github/workflows/ci.yml', () => {
  it('parses as valid YAML', () => {
    expect(workflow).toBeTypeOf('object')
    expect(workflow.jobs).toBeTypeOf('object')
  })

  it('triggers on push (branches main) and on pull_request', () => {
    const on = workflow.on ?? {}
    const triggers = Object.keys(on)
    expect(triggers).toContain('push')
    expect(triggers).toContain('pull_request')
    expect(on.push?.branches).toEqual(['main'])
  })

  it('declares a ref-keyed concurrency group that cancels PR runs but preserves main pushes', () => {
    const c = workflow.concurrency
    expect(c?.group).toBe('ci-${{ github.ref }}')
    expect(c?.['cancel-in-progress']).toBe("${{ github.ref != 'refs/heads/main' }}")
  })

  it('defines exactly the four jobs lint-and-typecheck, test, integration, build', () => {
    expect(Object.keys(workflow.jobs ?? {}).sort()).toEqual([
      'build',
      'integration',
      'lint-and-typecheck',
      'test',
    ])
  })

  it('build job needs lint-and-typecheck, test, and integration', () => {
    const needs = workflow.jobs?.build?.needs
    expect(Array.isArray(needs)).toBe(true)
    expect((needs as string[]).slice().sort()).toEqual([
      'integration',
      'lint-and-typecheck',
      'test',
    ])
  })

  it('integration job runs pnpm test:integration with timeout ≤ 15 minutes', () => {
    const job = workflow.jobs?.integration
    expect(job).toBeDefined()
    expect(job?.['runs-on']).toBe('ubuntu-latest')
    const timeout = job?.['timeout-minutes'] ?? 0
    expect(timeout).toBeGreaterThan(0)
    expect(timeout).toBeLessThanOrEqual(15)
    const runs = (job?.steps ?? []).map((s) => s.run ?? '')
    expect(runs).toContain('pnpm test:integration')
  })

  it('every job runs on ubuntu-latest', () => {
    for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
      expect(job['runs-on'], `${name} runs-on`).toBe('ubuntu-latest')
    }
  })

  it('every setup-node step pins Node 22 with pnpm cache via actions/setup-node@v4', () => {
    let setupNodeCount = 0
    for (const job of Object.values(workflow.jobs ?? {})) {
      const setupSteps = (job.steps ?? []).filter(
        (s) => typeof s.uses === 'string' && s.uses.startsWith('actions/setup-node@'),
      )
      expect(setupSteps.length).toBeGreaterThan(0)
      for (const step of setupSteps) {
        setupNodeCount += 1
        expect(step.uses).toBe('actions/setup-node@v4')
        expect(String(step.with?.['node-version'])).toBe('22')
        expect(step.with?.cache).toBe('pnpm')
      }
    }
    expect(setupNodeCount).toBe(4)
  })

  it('every job activates Corepack with pinned pnpm@9.15.4 before pnpm install', () => {
    for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
      const steps = job.steps ?? []
      const corepackIdx = steps.findIndex((s) => {
        const run = s.run ?? ''
        return /corepack\s+enable/.test(run) && /corepack\s+prepare\s+pnpm@9\.15\.4/.test(run)
      })
      const installIdx = steps.findIndex((s) => /pnpm install/.test(s.run ?? ''))
      expect(corepackIdx, `${name} corepack step`).toBeGreaterThanOrEqual(0)
      expect(installIdx, `${name} pnpm install step`).toBeGreaterThan(corepackIdx)
    }
  })

  it('does NOT configure a Postgres service (deferred per ADR-007 product-level)', () => {
    for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
      expect(job.services, `${name} services`).toBeUndefined()
    }
  })

  it('lint-and-typecheck job runs pnpm lint and pnpm typecheck', () => {
    const runs = (workflow.jobs?.['lint-and-typecheck']?.steps ?? []).map((s) => s.run ?? '')
    expect(runs).toContain('pnpm lint')
    expect(runs).toContain('pnpm typecheck')
  })

  it('test job runs pnpm test', () => {
    const runs = (workflow.jobs?.test?.steps ?? []).map((s) => s.run ?? '')
    expect(runs).toContain('pnpm test')
  })

  it('build job runs pnpm build', () => {
    const runs = (workflow.jobs?.build?.steps ?? []).map((s) => s.run ?? '')
    expect(runs).toContain('pnpm build')
  })

  it('does NOT include bundle-size budget logic (deferred to Feature 004)', () => {
    expect(raw).not.toMatch(/BUDGET_KB/)
    expect(raw).not.toMatch(/bundle.*size/i)
  })
})
