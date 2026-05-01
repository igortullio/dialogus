import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(__dirname, '..')
const README_PATH = resolve(REPO_ROOT, 'README.md')
const PRD_PATH = resolve(REPO_ROOT, '.compozy', 'tasks', '003-rag-agent', '_prd.md')

function sliceSection(source: string, heading: string): string {
  const start = source.indexOf(heading)
  if (start === -1) throw new Error(`Section not found: ${heading}`)
  const remainder = source.slice(start + heading.length)
  const nextH2 = remainder.search(/\n## /)
  return source.slice(start, nextH2 === -1 ? undefined : start + heading.length + nextH2)
}

function readExitCriteria(): string {
  const prd = readFileSync(PRD_PATH, 'utf8')
  const idx = prd.indexOf('\n## Exit Criteria Verification')
  if (idx === -1) throw new Error('Exit Criteria Verification section missing from _prd.md')
  return prd.slice(idx)
}

describe('Feature 003 closure — README', () => {
  const readme = readFileSync(README_PATH, 'utf8')

  it('contains a section titled "RAG Agent (feature 003)"', () => {
    expect(readme).toMatch(/^## RAG Agent \(feature 003\)/m)
  })

  it('"RAG Agent" section contains a link to apps/mastra/src/scripts/curl/README.md', () => {
    const section = sliceSection(readme, '## RAG Agent (feature 003)')
    expect(section).toContain('apps/mastra/src/scripts/curl/README.md')
  })

  it('"RAG Agent" section documents the agent boot (port 3002 + Studio 4111)', () => {
    const section = sliceSection(readme, '## RAG Agent (feature 003)')
    expect(section).toContain('3002')
    expect(section).toContain('4111')
  })

  it('"RAG Agent" section names all four tools', () => {
    const section = sliceSection(readme, '## RAG Agent (feature 003)')
    expect(section).toContain('semantic_search')
    expect(section).toContain('list_chapters')
    expect(section).toContain('get_chapter_summary')
    expect(section).toContain('find_character_mentions')
  })

  it('"RAG Agent" section documents all 5 smoke scripts', () => {
    const section = sliceSection(readme, '## RAG Agent (feature 003)')
    for (const script of [
      '01-add-books.sh',
      '02-create-thread.sh',
      '03-ask-question.sh',
      '04-spoiler-cap.sh',
      '05-empty-retrieval.sh',
    ]) {
      expect(section, `smoke script ${script}`).toContain(script)
    }
  })

  it('"RAG Agent" section includes a validation results table with all 4 PASS metrics', () => {
    const section = sliceSection(readme, '## RAG Agent (feature 003)')
    const passCount = (section.match(/\bPASS\b/g) ?? []).length
    expect(passCount).toBeGreaterThanOrEqual(4)
  })

  it('"API Problems" section has no feature-003 slugs (003 adds no new API routes)', () => {
    const section = sliceSection(readme, '## API Problems')
    expect(section).not.toContain('rag-agent')
    expect(section).not.toContain('dialogus-agent')
  })
})

describe('Feature 003 closure — _prd.md Exit Criteria Verification', () => {
  it('contains an "Exit Criteria Verification" section', () => {
    const body = readExitCriteria()
    expect(body).toContain('## Exit Criteria Verification')
  })

  it('records numerical citation resolvability (percentage)', () => {
    const body = readExitCriteria()
    expect(body).toMatch(/[Cc]itation\s+resolvability/i)
    expect(body).toMatch(/\d+\s*%/)
  })

  it('records numerical post-cap citation count', () => {
    const body = readExitCriteria()
    expect(body).toMatch(/[Pp]ost.cap|spoiler.cap/i)
    expect(body).toMatch(/\b0\b/)
  })

  it('records numerical unjustified refusal count', () => {
    const body = readExitCriteria()
    expect(body).toMatch(/[Uu]njustified\s+refusal/i)
    expect(body).toMatch(/\b0\b/)
  })

  it('records language-match accuracy (percentage)', () => {
    const body = readExitCriteria()
    expect(body).toMatch(/[Ll]anguage.match/i)
    expect(body).toMatch(/\d+\s*%/)
  })

  it('shows all four Primary Success Metrics as PASS', () => {
    const body = readExitCriteria()
    const passCount = (body.match(/\bPASS\b/g) ?? []).length
    expect(passCount).toBeGreaterThanOrEqual(4)
  })

  it('documents bilingual validation (EN + PT questions)', () => {
    const body = readExitCriteria()
    expect(body).toMatch(/EN|English/i)
    expect(body).toMatch(/PT|Portugu/i)
  })

  it('references validation-log.md for the committed evidence', () => {
    const body = readExitCriteria()
    expect(body).toContain('validation-log.md')
  })
})
