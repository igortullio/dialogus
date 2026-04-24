import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(__dirname, '..')

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

describe('biome.json', () => {
  const raw = readRepoFile('biome.json')
  const config = JSON.parse(raw) as {
    $schema?: string
    linter?: {
      enabled?: boolean
      rules?: {
        recommended?: boolean
        complexity?: {
          noExcessiveCognitiveComplexity?: {
            level?: string
            options?: { maxAllowedComplexity?: number }
          }
        }
      }
    }
    formatter?: {
      enabled?: boolean
      indentStyle?: string
      indentWidth?: number
      lineWidth?: number
    }
    javascript?: {
      formatter?: { quoteStyle?: string; semicolons?: string }
    }
    files?: { includes?: string[] }
  }

  it('parses as valid JSON', () => {
    expect(typeof config).toBe('object')
  })

  it('points at a Biome 2 schema', () => {
    expect(config.$schema).toMatch(/biomejs\.dev\/schemas\/2\./)
  })

  it('enables the linter with recommended rules', () => {
    expect(config.linter?.enabled).toBe(true)
    expect(config.linter?.rules?.recommended).toBe(true)
  })

  it('declares noExcessiveCognitiveComplexity at warn level with max 15', () => {
    const rule = config.linter?.rules?.complexity?.noExcessiveCognitiveComplexity
    expect(rule?.level).toBe('warn')
    expect(rule?.options?.maxAllowedComplexity).toBe(15)
  })

  it('formats with 2-space indent and 100-col line width', () => {
    expect(config.formatter?.enabled).toBe(true)
    expect(config.formatter?.indentStyle).toBe('space')
    expect(config.formatter?.indentWidth).toBe(2)
    expect(config.formatter?.lineWidth).toBe(100)
  })

  it("uses single quotes and semicolons='asNeeded' in JavaScript", () => {
    expect(config.javascript?.formatter?.quoteStyle).toBe('single')
    expect(config.javascript?.formatter?.semicolons).toBe('asNeeded')
  })

  it('excludes the mandated directories and generated files', () => {
    const includes = config.files?.includes ?? []
    const required = [
      '!**/node_modules',
      '!**/dist',
      '!**/build',
      '!**/coverage',
      '!**/.next',
      '!**/*.gen.ts',
      '!**/drizzle',
    ]
    for (const entry of required) {
      expect(includes, `missing exclude pattern: ${entry}`).toContain(entry)
    }
  })
})
