import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const appRoot = join(__dirname, '..')

const REQUIRED_SUITES = [
  '__tests__/integration/agent-conversation.integration.test.ts',
  '__tests__/integration/find-character-mentions.integration.test.ts',
  '__tests__/integration/semantic-search.integration.test.ts',
  '__tests__/integration/spoiler-cap.integration.test.ts',
  '__tests__/integration/summaries-read.integration.test.ts',
] as const

function findIntegrationSuites(root: string): string[] {
  const entries = readdirSync(root, { recursive: true, withFileTypes: true })
  const suites: string[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.integration.test.ts')) continue
    const relPath = relative(root, join(entry.parentPath, entry.name))
    const segments = relPath.split('/')
    if (segments.includes('node_modules') || segments.includes('dist')) continue
    suites.push(relPath)
  }
  return suites
}

describe('apps/mastra integration suite discovery', () => {
  const matches = findIntegrationSuites(appRoot)

  it('vitest.integration.config.ts include pattern resolves to at least 5 suites', () => {
    expect(matches.length).toBeGreaterThanOrEqual(5)
  })

  it.each(REQUIRED_SUITES)('discovers required suite %s', (relPath) => {
    expect(matches).toContain(relPath)
  })
})
