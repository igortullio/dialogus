import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')

function readPackageFile(relativePath: string): string {
  return readFileSync(join(packageRoot, relativePath), 'utf8')
}

describe('@dialogus/catalog package.json', () => {
  const pkg = JSON.parse(readPackageFile('package.json')) as Record<string, unknown>

  it('declares the workspace package name and ESM type', () => {
    expect(pkg.name).toBe('@dialogus/catalog')
    expect(pkg.type).toBe('module')
    expect(pkg.private).toBe(true)
  })

  it('declares the required runtime dependencies and nothing more', () => {
    const deps = pkg.dependencies as Record<string, string> | undefined
    expect(deps).toBeDefined()
    expect(deps?.['@dialogus/shared']).toBe('workspace:*')
    expect(deps?.zod).toBeTypeOf('string')
  })

  it('does not pull in Drizzle, an HTTP client, or @dialogus/db at the domain layer', () => {
    const deps = (pkg.dependencies ?? {}) as Record<string, string>
    expect('drizzle-orm' in deps).toBe(false)
    expect('postgres' in deps).toBe(false)
    expect('@dialogus/db' in deps).toBe(false)
    expect('lru-cache' in deps).toBe(false)
    expect('undici' in deps).toBe(false)
    expect('axios' in deps).toBe(false)
  })

  it('exposes typecheck + test scripts', () => {
    const scripts = pkg.scripts as Record<string, string> | undefined
    expect(scripts).toBeDefined()
    expect(scripts?.typecheck).toBeTypeOf('string')
    expect(scripts?.test).toBeTypeOf('string')
  })
})

describe('@dialogus/catalog tsconfig.json', () => {
  const tsconfig = JSON.parse(readPackageFile('tsconfig.json')) as Record<string, unknown>

  it('extends the root tsconfig', () => {
    expect(tsconfig.extends).toBe('../../tsconfig.json')
  })

  it('includes src and __tests__', () => {
    expect(tsconfig.include).toEqual(expect.arrayContaining(['src', '__tests__']))
  })
})

describe('@dialogus/catalog hexagonal folder layout', () => {
  const folders = [
    'src/domain/book',
    'src/application',
    'src/infrastructure/persistence',
    'src/infrastructure/persistence/mappers',
    'src/infrastructure/external',
  ]

  it.each(folders)('exists: %s', (folder) => {
    expect(existsSync(join(packageRoot, folder))).toBe(true)
  })
})

describe('@dialogus/catalog barrel', () => {
  it('exports the domain entity, ports, errors, and IngestionStatus enum', async () => {
    const mod = await import('@dialogus/catalog')
    expect(typeof mod.DuplicateBookError).toBe('function')
    expect(typeof mod.BookNotFoundError).toBe('function')
    expect(typeof mod.GutendexUpstreamError).toBe('function')
    expect(Array.isArray(mod.INGESTION_STATUS_VALUES)).toBe(true)
    expect(mod.INGESTION_STATUS_VALUES).toEqual([
      'discovered',
      'downloading',
      'parsing',
      'chunking',
      'embedding',
      'ready',
      'failed',
    ])
  })

  it('does not re-export anything from infrastructure/ (constraint is permanent)', () => {
    const indexSource = readPackageFile('src/index.ts')
    expect(indexSource).not.toMatch(/['"][^'"]*infrastructure[^'"]*['"]/)
  })

  it('does not re-export anything from application/ at this layer', () => {
    const indexSource = readPackageFile('src/index.ts')
    expect(indexSource).not.toMatch(/['"][^'"]*application[^'"]*['"]/)
  })
})
