import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const appRoot = join(__dirname, '..')
const curlDir = join(appRoot, 'src', 'scripts', 'curl')
const appReadme = join(appRoot, 'README.md')
const curlReadme = join(curlDir, 'README.md')
const curlGitignore = join(curlDir, '.gitignore')

const REQUIRED_SCRIPTS = [
  '01-add-books.sh',
  '02-create-thread.sh',
  '03-ask-question.sh',
  '04-spoiler-cap.sh',
  '05-empty-retrieval.sh',
] as const

const APP_README_SECTIONS = [
  '## Purpose',
  '## Boot',
  '## Env',
  '## Smoke Scripts',
  '## Integration Tests',
] as const

describe('apps/mastra README structure', () => {
  const body = readFileSync(appReadme, 'utf8')

  it.each(APP_README_SECTIONS)('contains heading %s', (heading) => {
    expect(body).toContain(heading)
  })
})

describe('cURL smoke scripts', () => {
  it('curl directory exists and contains all 5 scripts', () => {
    const entries = readdirSync(curlDir)
    for (const script of REQUIRED_SCRIPTS) {
      expect(entries).toContain(script)
    }
  })

  it.each(REQUIRED_SCRIPTS)('%s starts with bash shebang', (script) => {
    const head = readFileSync(join(curlDir, script), 'utf8').split('\n', 1)[0]
    expect(head).toBe('#!/usr/bin/env bash')
  })

  it.each(REQUIRED_SCRIPTS)('%s declares set -euo pipefail', (script) => {
    const body = readFileSync(join(curlDir, script), 'utf8')
    expect(body).toMatch(/^set -euo pipefail\b/m)
  })

  it.each(REQUIRED_SCRIPTS)('%s is marked executable', (script) => {
    const mode = statSync(join(curlDir, script)).mode
    expect(mode & 0o111).not.toBe(0)
  })

  it('.gitignore ignores tmp/', () => {
    const body = readFileSync(curlGitignore, 'utf8')
    expect(body).toMatch(/^tmp\/?$/m)
  })

  it('curl README documents all 5 scripts by name', () => {
    const body = readFileSync(curlReadme, 'utf8')
    for (const script of REQUIRED_SCRIPTS) {
      expect(body).toContain(script)
    }
  })
})
