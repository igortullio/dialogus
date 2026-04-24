import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const repoRoot = join(__dirname, '..')

function git(args: string[]): string | undefined {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  return result.stdout?.trim() || undefined
}

describe('prepare script activates .githooks on pnpm install', () => {
  const originalHooksPath = git(['config', '--get', 'core.hooksPath'])

  beforeAll(() => {
    spawnSync('git', ['config', '--unset', 'core.hooksPath'], { cwd: repoRoot })
  })

  afterAll(() => {
    if (originalHooksPath) {
      spawnSync('git', ['config', 'core.hooksPath', originalHooksPath], { cwd: repoRoot })
    }
  })

  it('resets core.hooksPath to .githooks after pnpm install', () => {
    expect(git(['config', '--get', 'core.hooksPath'])).toBeUndefined()

    const install = spawnSync('pnpm', ['install', '--prefer-offline'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    expect(install.status).toBe(0)

    expect(git(['config', '--get', 'core.hooksPath'])).toBe('.githooks')
  })
})
