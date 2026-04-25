import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const packageRoot = join(__dirname, '..')
const repoRoot = join(packageRoot, '..', '..')

function readPackageFile(relativePath: string): string {
  return readFileSync(join(packageRoot, relativePath), 'utf8')
}

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

describe('@dialogus/db package.json', () => {
  const pkg = JSON.parse(readPackageFile('package.json')) as Record<string, unknown>

  it('declares the workspace package name and ESM type', () => {
    expect(pkg.name).toBe('@dialogus/db')
    expect(pkg.type).toBe('module')
    expect(pkg.private).toBe(true)
  })

  it('declares required runtime dependencies', () => {
    const deps = pkg.dependencies as Record<string, string> | undefined
    expect(deps).toBeDefined()
    expect(deps?.['drizzle-orm']).toBeTypeOf('string')
    expect(deps?.postgres).toBeTypeOf('string')
    expect(deps?.['pg-boss']).toBeTypeOf('string')
    expect(deps?.['@dialogus/shared']).toBe('workspace:*')
  })

  it('declares required dev dependencies including drizzle-kit and tsx', () => {
    const devDeps = pkg.devDependencies as Record<string, string> | undefined
    expect(devDeps).toBeDefined()
    expect(devDeps?.['drizzle-kit']).toBeTypeOf('string')
    expect(devDeps?.tsx).toBeTypeOf('string')
    expect(devDeps?.typescript).toBeTypeOf('string')
    expect(devDeps?.vitest).toBeTypeOf('string')
  })

  it('exposes db:* + typecheck + test scripts', () => {
    const scripts = pkg.scripts as Record<string, string> | undefined
    expect(scripts).toBeDefined()
    const required = ['db:generate', 'db:studio', 'db:migrate', 'db:reset', 'typecheck', 'test']
    for (const name of required) {
      expect(scripts?.[name], `missing script: ${name}`).toBeTypeOf('string')
      expect(scripts?.[name]?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('wires db:migrate and db:reset through tsx src/migrate.ts', () => {
    const scripts = pkg.scripts as Record<string, string>
    expect(scripts['db:migrate']).toContain('tsx src/migrate.ts')
    expect(scripts['db:reset']).toContain('tsx src/migrate.ts')
  })

  it('does not expose a db:push script (ADR-002 compliance)', () => {
    const scripts = pkg.scripts as Record<string, string> | undefined
    expect(scripts && 'db:push' in scripts).toBe(false)
  })
})

describe('root package.json db:* dispatch', () => {
  const rootPkg = JSON.parse(readRepoFile('package.json')) as Record<string, unknown>
  const scripts = rootPkg.scripts as Record<string, string>

  it('dispatches every db:* script to @dialogus/db via pnpm --filter', () => {
    for (const name of ['db:generate', 'db:migrate', 'db:studio', 'db:reset']) {
      expect(scripts[name]).toBe(`pnpm --filter @dialogus/db ${name}`)
    }
  })

  it('does not expose a db:push script at the root (ADR-002 compliance)', () => {
    expect('db:push' in scripts).toBe(false)
  })
})

describe('drizzle.config.ts', () => {
  const source = readPackageFile('drizzle.config.ts')

  it('targets the postgresql dialect', () => {
    expect(source).toMatch(/dialect:\s*'postgresql'/)
  })

  it('points schema at ./src/schema', () => {
    expect(source).toMatch(/schema:\s*'\.\/src\/schema'/)
  })

  it('writes generated SQL to ./drizzle', () => {
    expect(source).toMatch(/out:\s*'\.\/drizzle'/)
  })

  it('reads DATABASE_URL from process.env and fails fast when absent', () => {
    expect(source).toMatch(/process\.env\.DATABASE_URL/)
    expect(source).toMatch(/throw new Error/)
  })
})

describe('@dialogus/db barrel imports', () => {
  it('resolves the root barrel (placeholder until tasks 09-12 add real content)', async () => {
    const mod = await import('@dialogus/db')
    expect(mod).toBeTypeOf('object')
  })

  it('resolves the ./schema subpath (placeholder until task_09)', async () => {
    const mod = await import('@dialogus/db/schema')
    expect(mod).toBeTypeOf('object')
  })
})
