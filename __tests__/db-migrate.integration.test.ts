import { type SpawnSyncReturns, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const repoRoot = join(__dirname, '..')
const CONTAINER = 'dialogus-postgres-1'
const DB_USER = 'dialogus'
const DB_NAME = 'dialogus'
const DATABASE_URL = `postgres://${DB_USER}:${DB_USER}@localhost:5432/${DB_NAME}`

function run(cmd: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(cmd, args, { cwd: repoRoot, encoding: 'utf8' })
}

function pnpm(...args: string[]): SpawnSyncReturns<string> {
  return spawnSync('pnpm', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL },
  })
}

function psql(query: string): SpawnSyncReturns<string> {
  return run('docker', ['exec', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-tAc', query])
}

function psqlAdmin(query: string): SpawnSyncReturns<string> {
  return run('docker', ['exec', CONTAINER, 'psql', '-U', DB_USER, '-d', 'postgres', '-tAc', query])
}

const dockerAvailable = run('docker', ['info', '--format', '{{.ServerVersion}}']).status === 0
const containerRunning =
  dockerAvailable &&
  run('docker', ['inspect', '--format', '{{.State.Running}}', CONTAINER]).stdout.trim() === 'true'

function resetDatabase(): void {
  // Terminate any open backends so DROP DATABASE succeeds.
  const terminate = psqlAdmin(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();`,
  )
  expect(terminate.status, terminate.stderr).toBe(0)

  const drop = psqlAdmin(`DROP DATABASE IF EXISTS ${DB_NAME};`)
  expect(drop.status, drop.stderr).toBe(0)

  const create = psqlAdmin(`CREATE DATABASE ${DB_NAME};`)
  expect(create.status, create.stderr).toBe(0)
}

describe.skipIf(!containerRunning)('db:migrate against docker-compose Postgres', () => {
  beforeAll(() => {
    resetDatabase()
  }, 60_000)

  it('exits 0 on a fresh database (db:migrate)', () => {
    const result = pnpm('db:migrate')
    expect(result.status, result.stderr || result.stdout).toBe(0)
  }, 60_000)

  it('seeds exactly one row into system_health', () => {
    const result = psql('SELECT COUNT(*) FROM system_health;')
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.trim()).toBe('1')
  })

  it('installs the vector and uuid-ossp extensions', () => {
    const result = psql(
      "SELECT extname FROM pg_extension WHERE extname IN ('vector', 'uuid-ossp') ORDER BY extname;",
    )
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.trim().split('\n')).toEqual(['uuid-ossp', 'vector'])
  })

  it('creates the pgboss schema via folded pg-boss init', () => {
    const result = psql(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'pgboss';",
    )
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.trim()).toBe('pgboss')
  })

  it('is idempotent — db:reset && db:migrate exits 0 against an already-migrated database', () => {
    const reset = pnpm('db:reset')
    expect(reset.status, reset.stderr || reset.stdout).toBe(0)
    const migrate = pnpm('db:migrate')
    expect(migrate.status, migrate.stderr || migrate.stdout).toBe(0)
  }, 120_000)
})
