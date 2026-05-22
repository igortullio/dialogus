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

  it('lists Node, pnpm, and Docker requirements with explicit versions', () => {
    expect(contents).toMatch(/Node\.js\s+\*\*22\.13\+\*\*/)
    expect(contents).toMatch(/pnpm\s+\*\*9\.15\+\*\*/)
    expect(contents).toMatch(/Docker Desktop\s+\*\*[≥>]=?\s*4\.30\*\*/)
  })

  it('contains the exact 5-command quickstart block in order', () => {
    const expected = [
      'corepack enable',
      'pnpm install',
      'docker compose up -d',
      'pnpm db:migrate',
      'pnpm dev',
    ].join('\n')
    expect(contents).toContain(expected)
  })

  it('exposes the canonical Requirements, Architecture, and Next steps headings', () => {
    expect(contents).toMatch(/^##\s+(Requirements|Requisitos)\b/m)
    expect(contents).toMatch(/^##\s+(Architecture|Arquitetura)\b/m)
    expect(contents).toMatch(/^##\s+(Next steps|Próximos passos)\b/im)
  })

  it('points Next steps at the Feature 001 catalog PRD', () => {
    expect(contents).toMatch(/\.compozy\/tasks\/001-catalog\/_prd\.md/)
  })

  it('mentions the Postgres 17 fallback note from ADR-001', () => {
    expect(contents).toMatch(/pgvector\/pgvector:pg17/)
    expect(contents).toMatch(/Postgres\s+17|pg17/i)
  })

  it('keeps the Architecture summary at three or more paragraphs', () => {
    const lines = contents.split('\n')
    const startIdx = lines.findIndex((line) => /^##\s+(Architecture|Arquitetura)\b/.test(line))
    expect(startIdx, 'Architecture heading is missing').toBeGreaterThanOrEqual(0)
    let endIdx = lines.length
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i]
      if (line !== undefined && /^##\s+/.test(line)) {
        endIdx = i
        break
      }
    }
    const body = lines.slice(startIdx + 1, endIdx).join('\n')
    const paragraphs = body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !p.startsWith('#') && !p.startsWith('```'))
    expect(paragraphs.length).toBeGreaterThanOrEqual(3)
  })

  it('cites Conventional Commits as the commit message convention with example prefixes', () => {
    expect(contents).toMatch(/Conventional Commits/)
    expect(contents).toMatch(/conventionalcommits\.org/)
    expect(contents).toMatch(/feat\(api\)/)
    expect(contents).toMatch(/chore\(repo\)/)
    expect(contents).toMatch(/docs:/)
  })

  it('links to the MIT LICENSE file', () => {
    expect(contents).toMatch(/\[MIT\]\(\.\/LICENSE\)/)
  })
})

describe('.env.example', () => {
  const contents = readRepoFile('.env.example')

  // Required keys must appear at least once (commented or not) so that a
  // newcomer copying the file knows the var exists. Defaults live in
  // packages/shared/src/config — values can be left blank or commented.
  const requiredKeys = ['DATABASE_URL', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY']

  it('mentions every required env var', () => {
    for (const key of requiredKeys) {
      expect(contents, `missing env key: ${key}`).toMatch(new RegExp(`^#?\\s*${key}=`, 'm'))
    }
  })
})
