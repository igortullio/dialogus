import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const packageRoot = join(__dirname, '..')

function readPackageFile(relativePath: string): string {
  return readFileSync(join(packageRoot, relativePath), 'utf8')
}

function packagePath(relativePath: string): string {
  return join(packageRoot, relativePath)
}

describe('@dialogus/api package.json', () => {
  const pkg = JSON.parse(readPackageFile('package.json')) as Record<string, unknown>

  it('declares the workspace package name and ESM type', () => {
    expect(pkg.name).toBe('@dialogus/api')
    expect(pkg.type).toBe('module')
    expect(pkg.private).toBe(true)
  })

  it('declares Hono runtime dependencies', () => {
    const deps = pkg.dependencies as Record<string, string> | undefined
    expect(deps).toBeDefined()
    expect(deps?.hono).toBeTypeOf('string')
    expect(deps?.['@hono/node-server']).toBeTypeOf('string')
    expect(deps?.pino).toBeTypeOf('string')
  })

  it('declares workspace dependencies on @dialogus/shared and @dialogus/db', () => {
    const deps = pkg.dependencies as Record<string, string> | undefined
    expect(deps?.['@dialogus/shared']).toBe('workspace:*')
    expect(deps?.['@dialogus/db']).toBe('workspace:*')
  })

  it('declares dev tooling: tsx, vitest, @types/node, pino-pretty', () => {
    const devDeps = pkg.devDependencies as Record<string, string> | undefined
    expect(devDeps).toBeDefined()
    expect(devDeps?.tsx).toBeTypeOf('string')
    expect(devDeps?.vitest).toBeTypeOf('string')
    expect(devDeps?.['@types/node']).toBeTypeOf('string')
    expect(devDeps?.['pino-pretty']).toBeTypeOf('string')
  })

  it('exposes dev/build/start/test/typecheck scripts with the expected commands', () => {
    const scripts = pkg.scripts as Record<string, string> | undefined
    expect(scripts).toBeDefined()
    expect(scripts?.dev).toBe('tsx watch src/index.ts')
    expect(scripts?.build).toBe('tsc --build')
    expect(scripts?.start).toBe('node dist/index.js')
    expect(scripts?.test).toBe('vitest run')
    expect(scripts?.typecheck).toBe('tsc --noEmit')
  })
})

describe('apps/api/tsconfig.json', () => {
  const tsconfig = JSON.parse(readPackageFile('tsconfig.json')) as {
    extends?: string
    compilerOptions?: Record<string, unknown>
    include?: string[]
  }

  it('extends the root tsconfig', () => {
    expect(tsconfig.extends).toBe('../../tsconfig.json')
  })

  it('emits to ./dist', () => {
    expect(tsconfig.compilerOptions?.outDir).toBe('./dist')
  })

  it('includes Node ambient types', () => {
    expect(tsconfig.compilerOptions?.types).toEqual(['node'])
  })

  it('includes src/** for compilation', () => {
    expect(tsconfig.include).toEqual(['src/**/*'])
  })
})

describe('apps/api source layout (ADR-004)', () => {
  it('contains the infrastructure/http/routes folder', () => {
    const routesDir = packagePath('src/infrastructure/http/routes')
    expect(existsSync(routesDir)).toBe(true)
    expect(statSync(routesDir).isDirectory()).toBe(true)
  })

  it('does NOT contain a domain/ folder (introduced in Feature 001)', () => {
    expect(existsSync(packagePath('src/domain'))).toBe(false)
  })

  it('does NOT contain an application/ folder (introduced in Feature 001)', () => {
    expect(existsSync(packagePath('src/application'))).toBe(false)
  })

  it('ships a placeholder src/index.ts that wires loadConfig', () => {
    const source = readPackageFile('src/index.ts')
    expect(source).toMatch(/from '@dialogus\/shared\/config'/)
    expect(source).toMatch(/loadConfig/)
  })
})
