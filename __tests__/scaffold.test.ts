import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const repoRoot = join(__dirname, '..')

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

describe('root package.json', () => {
  const raw = readRepoFile('package.json')
  const pkg = JSON.parse(raw) as Record<string, unknown>

  it('parses as valid JSON', () => {
    expect(typeof pkg).toBe('object')
  })

  it('declares required top-level fields', () => {
    expect(pkg.name).toBe('dialogus')
    expect(pkg.private).toBe(true)
    expect(pkg.type).toBe('module')
    expect(pkg.packageManager).toBe('pnpm@9.15.4')
  })

  it('pins Node engine to >=22', () => {
    const engines = pkg.engines as Record<string, string> | undefined
    expect(engines).toBeDefined()
    expect(engines?.node).toBe('>=22')
  })

  it('includes every required placeholder script', () => {
    const scripts = pkg.scripts as Record<string, string> | undefined
    expect(scripts).toBeDefined()
    const required = [
      'dev',
      'build',
      'test',
      'lint',
      'lint:fix',
      'typecheck',
      'db:generate',
      'db:migrate',
      'db:studio',
      'db:reset',
      'prepare',
    ]
    for (const name of required) {
      expect(scripts?.[name], `missing script: ${name}`).toBeTypeOf('string')
      expect(scripts?.[name]?.length ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('pnpm-workspace.yaml', () => {
  const raw = readRepoFile('pnpm-workspace.yaml')
  const parsed = parseYaml(raw) as { packages?: string[] }

  it('parses as valid YAML', () => {
    expect(parsed).toBeTypeOf('object')
  })

  it('lists exactly apps/* and packages/*', () => {
    expect(parsed.packages).toEqual(['apps/*', 'packages/*'])
  })
})

describe('root tsconfig.json', () => {
  const raw = readRepoFile('tsconfig.json')
  const tsconfig = JSON.parse(raw) as {
    compilerOptions?: Record<string, unknown>
  }

  it('parses as valid JSON', () => {
    expect(typeof tsconfig).toBe('object')
  })

  it('enables strict, noUncheckedIndexedAccess, and bundler resolution', () => {
    const opts = tsconfig.compilerOptions ?? {}
    expect(opts.strict).toBe(true)
    expect(opts.noUncheckedIndexedAccess).toBe(true)
    expect(opts.moduleResolution).toBe('bundler')
    expect(opts.target).toBe('ES2022')
  })
})

describe('.nvmrc', () => {
  it('pins Node 22', () => {
    const contents = readRepoFile('.nvmrc').trim()
    expect(contents).toMatch(/^22\./)
  })
})

describe('.gitignore', () => {
  const contents = readRepoFile('.gitignore')

  it('ignores node_modules, dist, .next, .env, coverage, and OS files', () => {
    const lines = contents.split('\n').map((line) => line.trim())
    const required = ['node_modules/', 'dist/', '.next/', '.env', 'coverage/', '.DS_Store']
    for (const entry of required) {
      expect(lines, `missing .gitignore entry: ${entry}`).toContain(entry)
    }
  })
})
