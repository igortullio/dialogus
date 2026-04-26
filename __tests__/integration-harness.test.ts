import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(__dirname, '..')

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8'))
}

function readText(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

describe('root package.json test:integration script', () => {
  const pkg = readJson('package.json')
  const scripts = pkg.scripts as Record<string, string>

  it('exposes a test:integration script', () => {
    expect(scripts['test:integration']).toBeTypeOf('string')
    expect((scripts['test:integration'] ?? '').length).toBeGreaterThan(0)
  })

  it('delegates to apps/api workspace via pnpm filter', () => {
    expect(scripts['test:integration']).toMatch(
      /pnpm\s+-r\s+--filter=@?dialogus\/api\s+test:integration/,
    )
  })
})

describe('apps/api package.json test:integration script', () => {
  const pkg = readJson('apps/api/package.json')
  const scripts = pkg.scripts as Record<string, string>

  it('exposes a test:integration script', () => {
    expect(scripts['test:integration']).toBeTypeOf('string')
  })

  it('invokes vitest run with the integration config', () => {
    expect(scripts['test:integration']).toBe('vitest run --config vitest.integration.config.ts')
  })
})

describe('apps/api/vitest.integration.config.ts', () => {
  const path = 'apps/api/vitest.integration.config.ts'

  it('exists', () => {
    expect(existsSync(join(repoRoot, path))).toBe(true)
  })

  const source = readText(path)

  it('includes only *.integration.test.ts files', () => {
    expect(source).toMatch(/include:\s*\[\s*['"`]\*\*\/\*\.integration\.test\.ts['"`]\s*\]/)
  })

  it('uses pool: "forks" for Testcontainers isolation', () => {
    expect(source).toMatch(/pool:\s*['"`]forks['"`]/)
  })

  it('sets generous testTimeout and hookTimeout sufficient for full ingestion pipelines', () => {
    const testTimeoutMatch = source.match(/testTimeout:\s*([0-9_]+)/)
    const hookTimeoutMatch = source.match(/hookTimeout:\s*([0-9_]+)/)
    expect(testTimeoutMatch).not.toBeNull()
    expect(hookTimeoutMatch).not.toBeNull()
    const testTimeoutMs = Number((testTimeoutMatch?.[1] ?? '0').replace(/_/g, ''))
    const hookTimeoutMs = Number((hookTimeoutMatch?.[1] ?? '0').replace(/_/g, ''))
    expect(testTimeoutMs).toBeGreaterThanOrEqual(30_000)
    expect(hookTimeoutMs).toBeGreaterThanOrEqual(30_000)
  })
})

describe('default vitest config excludes integration tests', () => {
  const rootSource = readText('vitest.config.ts')

  it('root vitest.config.ts excludes **/*.integration.test.ts from default test runs', () => {
    expect(rootSource).toMatch(/exclude:[\s\S]*\*\*\/\*\.integration\.test\.ts/)
  })
})
