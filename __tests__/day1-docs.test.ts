import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(__dirname, '..')

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

describe('LICENSE', () => {
  const contents = readRepoFile('LICENSE')

  it('declares the MIT License header', () => {
    expect(contents).toMatch(/MIT License/)
  })

  it('carries the 2026 copyright year', () => {
    expect(contents).toMatch(/Copyright \(c\) 2026\b/)
  })

  it('names the copyright holder', () => {
    expect(contents).toMatch(/Igor Túllio/)
  })

  it('preserves the MIT permission grant', () => {
    expect(contents).toMatch(/Permission is hereby granted, free of charge/)
    expect(contents).toMatch(/WITHOUT WARRANTY OF ANY KIND/)
  })
})

describe('README.md', () => {
  const contents = readRepoFile('README.md')

  it('opens with the dIAlogus product one-liner', () => {
    expect(contents).toMatch(/Single-user RAG study companion over public-domain classics/)
  })

  it('lists Node, pnpm, and Docker requirements', () => {
    expect(contents).toMatch(/Node\.js\s+\*\*22\.13\+\*\*/)
    expect(contents).toMatch(/pnpm\s+\*\*9\.15\+\*\*/)
    expect(contents).toMatch(/Docker Desktop/)
  })

  it('contains the exact 5-line quickstart block', () => {
    const expected = [
      'cp .env.example .env',
      'pnpm install',
      'docker compose up -d',
      'pnpm db:migrate',
      'pnpm dev',
    ].join('\n')
    expect(contents).toContain(expected)
  })

  it('includes placeholder sections for Architecture and Next Steps', () => {
    expect(contents).toMatch(/##\s+Architecture\b/)
    expect(contents).toMatch(/##\s+Next Steps\b/)
    expect(contents).toMatch(/Filled in by task_20/)
  })

  it('cites Conventional Commits as the commit message convention', () => {
    expect(contents).toMatch(/Conventional Commits/)
    expect(contents).toMatch(/conventionalcommits\.org/)
  })

  it('links to the MIT LICENSE file', () => {
    expect(contents).toMatch(/\[MIT\]\(\.\/LICENSE\)/)
  })
})

describe('.env.example', () => {
  const contents = readRepoFile('.env.example')

  const requiredKeys = [
    'DATABASE_URL',
    'NODE_ENV',
    'API_PORT',
    'WEB_PORT',
    'NEXT_PUBLIC_API_URL',
    'LOG_LEVEL',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'NEXT_PUBLIC_MASTRA_URL',
  ]

  it('declares every mandated env var as an assignment', () => {
    for (const key of requiredKeys) {
      expect(contents, `missing env key: ${key}`).toMatch(new RegExp(`^${key}=`, 'm'))
    }
  })

  it('gives every env assignment an inline feature comment on the same line', () => {
    const assignmentLines = contents.split('\n').filter((line) => /^[A-Z_][A-Z0-9_]*=/.test(line))

    expect(assignmentLines.length).toBeGreaterThanOrEqual(requiredKeys.length)

    for (const line of assignmentLines) {
      const key = line.split('=')[0]
      expect(line, `key ${key} lacks inline comment`).toMatch(/#\s*Feature\s+\d{3}\b/i)
    }
  })

  it('attributes OPENAI_API_KEY to Feature 002', () => {
    expect(contents).toMatch(/^OPENAI_API_KEY=.*#\s*Feature\s+002\b/im)
  })

  it('attributes ANTHROPIC_API_KEY and NEXT_PUBLIC_MASTRA_URL to Feature 003', () => {
    expect(contents).toMatch(/^ANTHROPIC_API_KEY=.*#\s*Feature\s+003\b/im)
    expect(contents).toMatch(/^NEXT_PUBLIC_MASTRA_URL=.*#\s*Feature\s+003\b/im)
  })
})
