import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')

function readPackageFile(relativePath: string): string {
  return readFileSync(join(packageRoot, relativePath), 'utf8')
}

describe('@dialogus/ingestion package.json', () => {
  const pkg = JSON.parse(readPackageFile('package.json')) as Record<string, unknown>

  it('declares the workspace package name and ESM type', () => {
    expect(pkg.name).toBe('@dialogus/ingestion')
    expect(pkg.type).toBe('module')
    expect(pkg.private).toBe(true)
  })

  it('declares the required runtime dependencies', () => {
    const deps = pkg.dependencies as Record<string, string> | undefined
    expect(deps).toBeDefined()
    expect(deps?.['@dialogus/shared']).toBe('workspace:*')
    expect(deps?.['@dialogus/db']).toBe('workspace:*')
    expect(deps?.['drizzle-orm']).toBeTypeOf('string')
    expect(deps?.zod).toBeTypeOf('string')
    expect(deps?.bottleneck).toBeTypeOf('string')
  })

  it('declares the EPUB parser adapter dependencies', () => {
    const deps = (pkg.dependencies ?? {}) as Record<string, string>
    expect(deps['@gxl/epub-parser']).toBeTypeOf('string')
    expect(deps.epub2).toBeTypeOf('string')
  })

  it('exposes typecheck + test scripts', () => {
    const scripts = pkg.scripts as Record<string, string> | undefined
    expect(scripts).toBeDefined()
    expect(scripts?.typecheck).toBeTypeOf('string')
    expect(scripts?.test).toBeTypeOf('string')
  })
})

describe('@dialogus/ingestion tsconfig.json', () => {
  const tsconfig = JSON.parse(readPackageFile('tsconfig.json')) as Record<string, unknown>

  it('extends the root tsconfig', () => {
    expect(tsconfig.extends).toBe('../../tsconfig.json')
  })

  it('includes src and __tests__', () => {
    expect(tsconfig.include).toEqual(expect.arrayContaining(['src', '__tests__']))
  })
})

describe('@dialogus/ingestion hexagonal folder layout', () => {
  const folders = [
    'src/domain/chapter',
    'src/domain/chunk',
    'src/domain/embedding',
    'src/domain/parser',
    'src/domain/ingestion',
    'src/application/stages',
    'src/infrastructure/persistence',
    'src/infrastructure/external',
    'src/infrastructure/parsing',
  ]

  it.each(folders)('exists: %s', (folder) => {
    expect(existsSync(join(packageRoot, folder))).toBe(true)
  })
})

describe('@dialogus/ingestion barrel', () => {
  it('exports the six ingestion stage error classes', async () => {
    const mod = await import('@dialogus/ingestion')
    expect(typeof mod.DownloadError).toBe('function')
    expect(typeof mod.CleanError).toBe('function')
    expect(typeof mod.ParseError).toBe('function')
    expect(typeof mod.ChunkError).toBe('function')
    expect(typeof mod.EmbedError).toBe('function')
    expect(typeof mod.IndexError).toBe('function')
  })

  it('limits infrastructure re-exports to the DrizzleChapterSummaryRepository (ADR-006 carve-out)', () => {
    const indexSource = readPackageFile('src/index.ts')
    const matches = indexSource.match(/['"][^'"]*infrastructure[^'"]*['"]/g) ?? []
    expect(matches).toEqual([`'./infrastructure/persistence/DrizzleChapterSummaryRepository'`])
  })
})
