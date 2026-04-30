import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(__dirname, '..')
const README_PATH = resolve(REPO_ROOT, 'README.md')
const PRD_PATH = resolve(REPO_ROOT, '.compozy', 'tasks', '002-ingestion', '_prd.md')

const ISO_8601_UTC = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\b/

const INGESTION_SLUGS = [
  'book-not-in-discovered-state',
  'book-not-in-retryable-state',
  'book-already-ready',
  'ingestion-download-failed',
  'ingestion-parse-failed',
  'ingestion-summarize-failed',
  'ingestion-embed-failed',
  'chunk-not-found',
] as const

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

describe('Feature 002 closure — README', () => {
  const readme = readFileSync(README_PATH, 'utf8')

  it('contains a section titled "Ingestion (feature 002)"', () => {
    expect(readme).toMatch(/^## Ingestion \(feature 002\)/m)
  })

  it('"Ingestion" section contains POST /ingest cURL command', () => {
    const section = sliceSection(readme, '## Ingestion (feature 002)')
    expect(section).toContain('POST')
    expect(section).toContain('/ingest')
  })

  it('"Ingestion" section contains GET /ingestion poll command', () => {
    const section = sliceSection(readme, '## Ingestion (feature 002)')
    expect(section).toContain('/ingestion')
  })

  it('"Ingestion" section contains GET /chunks cURL command', () => {
    const section = sliceSection(readme, '## Ingestion (feature 002)')
    expect(section).toContain('/chunks')
  })

  it('"Ingestion" section contains at least 6 cURL commands', () => {
    const section = sliceSection(readme, '## Ingestion (feature 002)')
    const curlCount = (section.match(/^curl/gm) ?? []).length
    expect(curlCount).toBeGreaterThanOrEqual(6)
  })

  it('"API Problems — Ingestion slugs" section contains all 8 required slugs', () => {
    for (const slug of INGESTION_SLUGS) {
      expect(readme, `slug ${slug}`).toContain(slug)
    }
  })
})

describe('Feature 002 closure — _prd.md Exit Criteria Verification', () => {
  it('contains an "Exit Criteria Verification" section appended at the bottom', () => {
    const body = readExitCriteria()
    expect(body).toContain('## Exit Criteria Verification')
  })

  it('records an ISO-8601 UTC closure timestamp', () => {
    const body = readExitCriteria()
    const match = body.match(/\*\*Closed at:\*\*\s+(\S+)/)
    expect(match, 'Closed at timestamp').not.toBeNull()
    expect(match?.[1] ?? '').toMatch(ISO_8601_UTC)
  })

  it('records memory footprint for the large-book ingestion (peak RSS ~N MB)', () => {
    const body = readExitCriteria()
    expect(body).toMatch(/peak.*RSS.*\d+\s*MB/i)
  })

  it('records wall-clock stage breakdown for at least one book', () => {
    const body = readExitCriteria()
    expect(body).toMatch(/\d+\s*ms/)
    expect(body).toMatch(/parse|chunk|embed|index/i)
  })

  it('documents 3 books (2 EN + 1 PT) reaching ready state', () => {
    const body = readExitCriteria()
    expect(body).toContain('Moby Dick')
    expect(body).toContain('Crime and Punishment')
    expect(body).toContain('Dom Casmurro')
    expect(body).toContain('ready')
  })

  it('documents the retry path with induced failure evidence', () => {
    const body = readExitCriteria()
    expect(body).toMatch(/retry/i)
    expect(body).toMatch(/failed/i)
    expect(body).toMatch(/ingestion-embed-failed/i)
  })

  it('documents the chapter_summaries ADR-008 invariant check', () => {
    const body = readExitCriteria()
    expect(body).toMatch(/chapter_summaries/i)
    expect(body).toMatch(/invariant|missing summaries|ADR-008/i)
  })

  it('documents the HNSW index confirmation', () => {
    const body = readExitCriteria()
    expect(body).toMatch(/hnsw|chunks_embedding_hnsw_idx/i)
  })

  it('documents summarizing stage transition observed during polling', () => {
    const body = readExitCriteria()
    expect(body).toMatch(/summariz/i)
  })

  it('marks Feature 002 Phase 1 as closed', () => {
    const body = readExitCriteria()
    expect(body).toMatch(/Phase 1.*[Cc]losed|Feature 002.*[Cc]losed/i)
  })
})
