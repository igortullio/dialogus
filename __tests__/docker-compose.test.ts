import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const repoRoot = join(__dirname, '..')

type ComposeService = {
  image?: string
  ports?: Array<string | { published?: number | string; target?: number }>
  environment?: Record<string, string> | string[]
  volumes?: Array<string | { source?: string; target?: string }>
  healthcheck?: {
    test?: string | string[]
    interval?: string
    retries?: number
    timeout?: string
  }
}

type Compose = {
  services?: Record<string, ComposeService>
  volumes?: Record<string, unknown>
}

const raw = readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf8')
const compose = parseYaml(raw) as Compose

describe('docker-compose.yml', () => {
  it('parses as valid YAML', () => {
    expect(compose).toBeTypeOf('object')
    expect(compose.services).toBeTypeOf('object')
  })

  it('declares a single postgres service', () => {
    expect(Object.keys(compose.services ?? {})).toEqual(['postgres'])
  })

  it('uses image pgvector/pgvector:pg18', () => {
    expect(compose.services?.postgres?.image).toBe('pgvector/pgvector:pg18')
  })

  it('binds host port 5432 to container port 5432', () => {
    const ports = compose.services?.postgres?.ports ?? []
    expect(ports.length).toBe(1)
    const [first] = ports
    expect(typeof first === 'string' ? first : `${first?.published}:${first?.target}`).toBe(
      '5432:5432',
    )
  })

  it('mounts the named volume dialogus-postgres-data at the Postgres data dir', () => {
    const volumes = compose.services?.postgres?.volumes ?? []
    expect(volumes).toContain('dialogus-postgres-data:/var/lib/postgresql')
  })

  it('declares dialogus-postgres-data as a top-level named volume', () => {
    expect(compose.volumes).toBeTypeOf('object')
    expect(Object.keys(compose.volumes ?? {})).toContain('dialogus-postgres-data')
  })

  it('configures POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB with dialogus defaults overridable via host env', () => {
    const env = compose.services?.postgres?.environment as Record<string, string> | undefined
    expect(env).toBeTypeOf('object')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting literal Docker Compose variable interpolation syntax
    expect(env?.POSTGRES_USER).toBe('${POSTGRES_USER:-dialogus}')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting literal Docker Compose variable interpolation syntax
    expect(env?.POSTGRES_PASSWORD).toBe('${POSTGRES_PASSWORD:-dialogus}')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting literal Docker Compose variable interpolation syntax
    expect(env?.POSTGRES_DB).toBe('${POSTGRES_DB:-dialogus}')
  })

  it('defines a pg_isready healthcheck with interval 5s and 10 retries', () => {
    const hc = compose.services?.postgres?.healthcheck
    expect(hc).toBeDefined()
    const test = hc?.test
    const flat = Array.isArray(test) ? test.join(' ') : (test ?? '')
    expect(flat).toMatch(/pg_isready/)
    expect(flat).toMatch(/-U\s+dialogus/)
    expect(hc?.interval).toBe('5s')
    expect(hc?.retries).toBe(10)
  })
})

describe('README.md PG 17 fallback documentation', () => {
  const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8')

  it('mentions pgvector/pgvector:pg17 as a fallback', () => {
    expect(readme).toMatch(/pgvector\/pgvector:pg17/)
  })

  it('frames the fallback in an Apple Silicon context', () => {
    expect(readme).toMatch(/Apple Silicon/i)
  })
})
