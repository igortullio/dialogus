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

describe('@dialogus/web package.json', () => {
  const pkg = JSON.parse(readPackageFile('package.json')) as Record<string, unknown>

  it('declares the workspace package name and ESM type', () => {
    expect(pkg.name).toBe('@dialogus/web')
    expect(pkg.type).toBe('module')
    expect(pkg.private).toBe(true)
  })

  it('declares Next.js 16 + React 19 runtime dependencies', () => {
    const deps = pkg.dependencies as Record<string, string> | undefined
    expect(deps).toBeDefined()
    expect(deps?.next).toMatch(/^\^16\./)
    expect(deps?.react).toMatch(/^\^19\./)
    expect(deps?.['react-dom']).toMatch(/^\^19\./)
  })

  it('declares workspace dependency on @dialogus/shared', () => {
    const deps = pkg.dependencies as Record<string, string> | undefined
    expect(deps?.['@dialogus/shared']).toBe('workspace:*')
  })

  it('declares dev tooling: typescript, react types, node types, vitest, testing-library, jsdom', () => {
    const devDeps = pkg.devDependencies as Record<string, string> | undefined
    expect(devDeps).toBeDefined()
    expect(devDeps?.typescript).toBeTypeOf('string')
    expect(devDeps?.['@types/react']).toBeTypeOf('string')
    expect(devDeps?.['@types/react-dom']).toBeTypeOf('string')
    expect(devDeps?.['@types/node']).toBeTypeOf('string')
    expect(devDeps?.vitest).toBeTypeOf('string')
    expect(devDeps?.['@testing-library/react']).toBeTypeOf('string')
    expect(devDeps?.jsdom).toBeTypeOf('string')
  })

  it('does NOT declare Tailwind or shadcn (Feature 004 enforcement)', () => {
    const allDeps = {
      ...((pkg.dependencies as Record<string, string> | undefined) ?? {}),
      ...((pkg.devDependencies as Record<string, string> | undefined) ?? {}),
    }
    for (const name of Object.keys(allDeps)) {
      expect(name).not.toMatch(/^tailwindcss/)
      expect(name).not.toMatch(/^@tailwindcss/)
      expect(name).not.toMatch(/shadcn/)
      expect(name).not.toMatch(/^@tanstack\/react-query/)
    }
  })

  it('exposes dev/build/start/test/typecheck scripts with the expected commands', () => {
    const scripts = pkg.scripts as Record<string, string> | undefined
    expect(scripts).toBeDefined()
    expect(scripts?.dev).toBe('next dev -p 3000')
    expect(scripts?.build).toBe('next build')
    expect(scripts?.start).toBe('next start -p 3000')
    expect(scripts?.test).toBe('vitest run')
    expect(scripts?.typecheck).toBe('tsc --noEmit')
  })
})

describe('apps/web/tsconfig.json', () => {
  const tsconfig = JSON.parse(readPackageFile('tsconfig.json')) as {
    extends?: string
    compilerOptions?: Record<string, unknown>
    include?: string[]
  }

  it('extends the root tsconfig', () => {
    expect(tsconfig.extends).toBe('../../tsconfig.json')
  })

  it('preserves JSX for Next.js compatibility', () => {
    expect(tsconfig.compilerOptions?.jsx).toBe('preserve')
  })

  it('disables emit (next handles compilation)', () => {
    expect(tsconfig.compilerOptions?.noEmit).toBe(true)
  })

  it('registers the Next.js TypeScript plugin', () => {
    const plugins = tsconfig.compilerOptions?.plugins as Array<{ name?: string }> | undefined
    expect(plugins).toEqual(expect.arrayContaining([{ name: 'next' }]))
  })
})

describe('apps/web source layout', () => {
  it('contains the App Router layout.tsx', () => {
    expect(existsSync(packagePath('src/app/layout.tsx'))).toBe(true)
    expect(statSync(packagePath('src/app/layout.tsx')).isFile()).toBe(true)
  })

  it('contains the App Router page.tsx', () => {
    expect(existsSync(packagePath('src/app/page.tsx'))).toBe(true)
    expect(statSync(packagePath('src/app/page.tsx')).isFile()).toBe(true)
  })

  it('ships a minimal next.config.ts', () => {
    const source = readPackageFile('next.config.ts')
    expect(source).toMatch(/import type \{ NextConfig \} from 'next'/)
    expect(source).toMatch(/export default/)
  })
})
