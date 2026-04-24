import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const repoRoot = join(__dirname, '..')

function run(cmd: string, args: string[], cwd: string) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, HUSKY: '0' } })
}

describe('pre-commit hook rejects commits with lint errors', () => {
  let sandbox: string

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'dialogus-precommit-'))

    copyFileSync(join(repoRoot, 'biome.json'), join(sandbox, 'biome.json'))

    mkdirSync(join(sandbox, '.githooks'))
    copyFileSync(
      join(repoRoot, '.githooks', 'pre-commit'),
      join(sandbox, '.githooks', 'pre-commit'),
    )
    chmodSync(join(sandbox, '.githooks', 'pre-commit'), 0o755)

    symlinkSync(join(repoRoot, 'node_modules'), join(sandbox, 'node_modules'))

    writeFileSync(
      join(sandbox, 'package.json'),
      `${JSON.stringify(
        {
          name: 'dialogus-hook-sandbox',
          private: true,
          scripts: {
            lint: 'biome check .',
            typecheck: 'node -e "process.exit(0)"',
            test: 'node -e "process.exit(0)"',
          },
        },
        null,
        2,
      )}\n`,
    )

    const initResult = run('git', ['init', '--initial-branch=main'], sandbox)
    expect(initResult.status).toBe(0)
    run('git', ['config', 'user.email', 'test@example.com'], sandbox)
    run('git', ['config', 'user.name', 'Hook Test'], sandbox)
    run('git', ['config', 'commit.gpgsign', 'false'], sandbox)
    run('git', ['config', 'core.hooksPath', '.githooks'], sandbox)
  })

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true })
  })

  it('exits non-zero when a staged file has Biome lint errors', () => {
    const badTs = 'const x = "double-quoted";\nexport { x };'
    writeFileSync(join(sandbox, 'bad.ts'), badTs)

    const addResult = run('git', ['add', 'bad.ts'], sandbox)
    expect(addResult.status).toBe(0)

    const commitResult = run('git', ['commit', '-m', 'should be blocked'], sandbox)
    expect(commitResult.status).not.toBe(0)
    expect(commitResult.status).toBe(1)
  })
})
