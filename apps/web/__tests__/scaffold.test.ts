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

describe('@dialogus/web package.json (Feature 004 scaffold)', () => {
  const pkg = JSON.parse(readPackageFile('package.json')) as Record<string, unknown>
  const deps = (pkg.dependencies as Record<string, string> | undefined) ?? {}
  const devDeps = (pkg.devDependencies as Record<string, string> | undefined) ?? {}

  it('declares the workspace package name and ESM type', () => {
    expect(pkg.name).toBe('@dialogus/web')
    expect(pkg.type).toBe('module')
    expect(pkg.private).toBe(true)
  })

  it('pins Next.js 16 + React 19 runtime dependencies to exact versions', () => {
    expect(deps.next).toMatch(/^16\./)
    expect(deps.react).toMatch(/^19\./)
    expect(deps['react-dom']).toMatch(/^19\./)
  })

  it('declares workspace deps on @dialogus/shared and @dialogus/rag', () => {
    expect(deps['@dialogus/shared']).toBe('workspace:*')
    expect(deps['@dialogus/rag']).toBe('workspace:*')
  })

  it('pins assistant-ui + Vercel AI SDK + TanStack Query exact versions', () => {
    expect(deps['@assistant-ui/react']).toMatch(/^\d+\.\d+\.\d+$/)
    expect(deps['@assistant-ui/react-ai-sdk']).toMatch(/^\d+\.\d+\.\d+$/)
    expect(deps['@ai-sdk/react']).toMatch(/^\d+\.\d+\.\d+$/)
    expect(deps['@tanstack/react-query']).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('declares Tailwind v4 + shadcn baseline deps', () => {
    expect(devDeps.tailwindcss).toMatch(/^4\./)
    expect(devDeps['@tailwindcss/postcss']).toMatch(/^4\./)
    expect(devDeps['tw-animate-css']).toBeTypeOf('string')
    expect(deps['class-variance-authority']).toBeTypeOf('string')
    expect(deps['tailwind-merge']).toBeTypeOf('string')
    expect(deps.clsx).toBeTypeOf('string')
    expect(deps['lucide-react']).toBeTypeOf('string')
    expect(deps.sonner).toBeTypeOf('string')
    expect(deps['next-themes']).toBeTypeOf('string')
  })

  it('declares the @mastra/client-js dep used for thread metadata verification', () => {
    expect(deps['@mastra/client-js']).toBeTypeOf('string')
  })

  it('declares dev tooling: typescript, react types, node types, vitest, testing-library, jsdom', () => {
    expect(devDeps.typescript).toBeTypeOf('string')
    expect(devDeps['@types/react']).toBeTypeOf('string')
    expect(devDeps['@types/react-dom']).toBeTypeOf('string')
    expect(devDeps['@types/node']).toBeTypeOf('string')
    expect(devDeps.vitest).toBeTypeOf('string')
    expect(devDeps['@testing-library/react']).toBeTypeOf('string')
    expect(devDeps.jsdom).toBeTypeOf('string')
  })

  it('exposes dev/build/start/test/typecheck scripts with the expected commands', () => {
    const scripts = pkg.scripts as Record<string, string> | undefined
    expect(scripts).toBeDefined()
    expect(scripts?.dev).toBe('CHOKIDAR_USEPOLLING=1 next dev -p 3000')
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

  it('maps the @/* path alias to ./src/*', () => {
    const paths = tsconfig.compilerOptions?.paths as Record<string, string[]> | undefined
    expect(paths?.['@/*']).toEqual(['./src/*'])
  })
})

describe('apps/web Feature 004 scaffold layout', () => {
  it('contains the App Router layout.tsx and page.tsx', () => {
    expect(existsSync(packagePath('src/app/layout.tsx'))).toBe(true)
    expect(statSync(packagePath('src/app/layout.tsx')).isFile()).toBe(true)
    expect(existsSync(packagePath('src/app/page.tsx'))).toBe(true)
    expect(statSync(packagePath('src/app/page.tsx')).isFile()).toBe(true)
  })

  it('ships the Tailwind v4 globals.css with @import "tailwindcss" + @theme inline + .dark', () => {
    expect(existsSync(packagePath('src/app/globals.css'))).toBe(true)
    const css = readPackageFile('src/app/globals.css')
    expect(css).toMatch(/@import\s+['"]tailwindcss['"]/)
    expect(css).toMatch(/@import\s+['"]tw-animate-css['"]/)
    expect(css).toMatch(/@theme inline\s*\{/)
    expect(css).toMatch(/\.dark\s*\{/)
  })

  it('ships components.json (shadcn config) targeting Tailwind v4 (empty config path)', () => {
    expect(existsSync(packagePath('components.json'))).toBe(true)
    const json = JSON.parse(readPackageFile('components.json')) as {
      tailwind?: { config?: string; css?: string }
      aliases?: Record<string, string>
    }
    expect(json.tailwind?.config).toBe('')
    expect(json.tailwind?.css).toBe('src/app/globals.css')
    expect(json.aliases?.ui).toBe('@/components/ui')
  })

  it('ships postcss.config.mjs with the @tailwindcss/postcss plugin', () => {
    expect(existsSync(packagePath('postcss.config.mjs'))).toBe(true)
    const source = readPackageFile('postcss.config.mjs')
    expect(source).toMatch(/@tailwindcss\/postcss/)
  })

  it('ships shadcn primitives required for task_01 (button, card, badge, input, separator, skeleton, sonner)', () => {
    for (const file of [
      'src/components/ui/button.tsx',
      'src/components/ui/card.tsx',
      'src/components/ui/badge.tsx',
      'src/components/ui/input.tsx',
      'src/components/ui/separator.tsx',
      'src/components/ui/skeleton.tsx',
      'src/components/ui/sonner.tsx',
    ]) {
      expect(existsSync(packagePath(file))).toBe(true)
    }
  })

  it('ships the lib/utils.ts cn() helper, query-client.tsx, feature-flags.ts, and theme-provider.tsx', () => {
    for (const file of [
      'src/lib/utils.ts',
      'src/lib/query-client.tsx',
      'src/lib/feature-flags.ts',
      'src/components/theme-provider.tsx',
    ]) {
      expect(existsSync(packagePath(file))).toBe(true)
    }
  })

  it('ships the next.config.ts with typedRoutes + Gutendex image hosts', () => {
    const source = readPackageFile('next.config.ts')
    expect(source).toMatch(/import type \{ NextConfig \} from 'next'/)
    expect(source).toMatch(/typedRoutes:\s*true/)
    expect(source).toMatch(/gutendex\.com/)
  })
})
