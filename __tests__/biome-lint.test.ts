import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const repoRoot = join(__dirname, '..')
const biomeBin = join(repoRoot, 'node_modules', '.bin', 'biome')

describe('biome check on malformed input', () => {
  let workDir: string

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'dialogus-biome-'))
  })

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  it('exits non-zero on an intentionally malformed TypeScript file', () => {
    const bad = join(workDir, 'bad.ts')
    writeFileSync(bad, 'const x = "double-quoted";\nexport { x };')
    const result = spawnSync(biomeBin, ['check', bad], { cwd: repoRoot })
    expect(result.status).not.toBe(0)
  })

  it('exits zero on a well-formed TypeScript file', () => {
    const good = join(workDir, 'good.ts')
    writeFileSync(good, 'export const answer = 42\n')
    const result = spawnSync(biomeBin, ['check', good], { cwd: repoRoot })
    expect(result.status).toBe(0)
  })
})
