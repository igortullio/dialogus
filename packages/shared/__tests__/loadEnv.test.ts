import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { loadEnvFromRoot } from '@dialogus/shared/config'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const PROBE_KEY = '__DIALOGUS_LOAD_ENV_TEST__'

describe('loadEnvFromRoot', () => {
  let scratch: string

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'dialogus-env-'))
    delete process.env[PROBE_KEY]
  })

  afterEach(() => {
    delete process.env[PROBE_KEY]
    rmSync(scratch, { recursive: true, force: true })
  })

  it('walks up from startDir and loads .env into process.env', () => {
    writeFileSync(resolve(scratch, '.env'), `${PROBE_KEY}=found-at-root\n`)
    const nested = resolve(scratch, 'packages', 'db')
    mkdirSync(nested, { recursive: true })
    const found = loadEnvFromRoot(nested)
    expect(found).toBe(true)
    expect(process.env[PROBE_KEY]).toBe('found-at-root')
  })

  it('returns false and does not mutate env when no .env exists between startDir and filesystem root', () => {
    const nested = resolve(scratch, 'apps', 'api')
    mkdirSync(nested, { recursive: true })
    const found = loadEnvFromRoot(nested)
    expect(found).toBe(false)
    expect(process.env[PROBE_KEY]).toBeUndefined()
  })
})
