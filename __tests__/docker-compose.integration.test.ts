import { type SpawnSyncReturns, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const repoRoot = join(__dirname, '..')
const PROJECT = 'dialogus-it-pg18'

function run(cmd: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(cmd, args, { cwd: repoRoot, encoding: 'utf8' })
}

function compose(...args: string[]): SpawnSyncReturns<string> {
  return run('docker', ['compose', '-p', PROJECT, ...args])
}

const dockerAvailable = run('docker', ['info', '--format', '{{.ServerVersion}}']).status === 0

describe.skipIf(!dockerAvailable)('docker-compose postgres integration', () => {
  beforeAll(async () => {
    const pull = compose('pull', 'postgres')
    expect(pull.status, pull.stderr).toBe(0)

    const up = compose('up', '-d', 'postgres')
    expect(up.status, up.stderr).toBe(0)

    const deadline = Date.now() + 30_000
    let lastStatus = ''
    while (Date.now() < deadline) {
      const id = compose('ps', '-q', 'postgres').stdout.trim()
      if (id) {
        const health = run('docker', ['inspect', '--format', '{{.State.Health.Status}}', id])
        lastStatus = health.stdout.trim()
        if (lastStatus === 'healthy') return
      }
      await new Promise((r) => setTimeout(r, 1500))
    }
    throw new Error(`postgres did not reach healthy state within 30s; last=${lastStatus}`)
  }, 120_000)

  afterAll(() => {
    compose('down', '-v')
  }, 60_000)

  it('reports PostgreSQL 18 from psql SELECT version()', () => {
    const result = compose(
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'dialogus',
      '-tAc',
      'SELECT version();',
    )
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toMatch(/PostgreSQL 18/)
  })

  it('exposes the pgvector extension as available', () => {
    const result = compose(
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'dialogus',
      '-tAc',
      "SELECT name FROM pg_available_extensions WHERE name = 'vector';",
    )
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.trim()).toBe('vector')
  })
})
