import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const REPO_ROOT = resolve(__dirname, '..')
const README_PATH = resolve(REPO_ROOT, 'README.md')
const TASKS_FILE = resolve(REPO_ROOT, '.compozy', 'tasks', '004-chat-ui', '_tasks.md')
const META_FILE = resolve(REPO_ROOT, '.compozy', 'tasks', '004-chat-ui', '_meta.md')
const SCREENSHOTS_DIR = resolve(REPO_ROOT, 'docs', 'screenshots')
const SCREENCAST_DOC = resolve(REPO_ROOT, 'docs', 'SCREENCAST.md')

interface SectionSlice {
  body: string
}

function sliceSection(source: string, headingLine: string, terminator: RegExp): SectionSlice {
  const startIdx = source.indexOf(headingLine)
  if (startIdx === -1) {
    throw new Error(`Section heading not found: ${headingLine}`)
  }
  const remainder = source.slice(startIdx + headingLine.length)
  const terminatorMatch = remainder.match(terminator)
  const terminatorIndex = terminatorMatch?.index
  const endIdx =
    typeof terminatorIndex === 'number'
      ? startIdx + headingLine.length + terminatorIndex
      : source.length
  return { body: source.slice(startIdx, endIdx) }
}

describe('Feature 004 closure — README', () => {
  const readme = readFileSync(README_PATH, 'utf8')

  it('contains a section titled "Chat UI (feature 004)"', () => {
    expect(readme).toMatch(/^## Chat UI \(feature 004\)/m)
  })

  it('"Chat UI" section contains links to ≥ 3 screenshots under docs/screenshots/', () => {
    const slice = sliceSection(readme, '## Chat UI (feature 004)', /^## /m)
    const screenshotLinks = Array.from(slice.body.matchAll(/docs\/screenshots\/[\w-]+\.png/g))
    expect(screenshotLinks.length).toBeGreaterThanOrEqual(3)
  })

  it('"Chat UI" section links to the screencast (relative path or external URL)', () => {
    const slice = sliceSection(readme, '## Chat UI (feature 004)', /^## /m)
    const screencastReference =
      /docs\/SCREENCAST\.md|docs\/screencast\.mp4|https?:\/\/[^\s)]+screencast/i
    expect(slice.body).toMatch(screencastReference)
  })

  it('"Stack" section mentions apps/web tech (Next + Tailwind v4 + shadcn + assistant-ui + AI SDK + TanStack Query)', () => {
    const slice = sliceSection(readme, '## Stack', /^## /m)
    expect(slice.body).toMatch(/Next\.js 16/)
    expect(slice.body).toMatch(/Tailwind v4/)
    expect(slice.body).toMatch(/shadcn/i)
    expect(slice.body).toMatch(/assistant-ui/)
    expect(slice.body).toMatch(/Vercel AI SDK|useChat/)
    expect(slice.body).toMatch(/TanStack Query/)
  })

  it('"Chat UI" section records ≥ 5 PRD Primary Success Metric proxies (architecture + a11y + bilingual + spoiler + screencast)', () => {
    const slice = sliceSection(readme, '## Chat UI (feature 004)', /^## /m)
    const metricLabels = [
      /citation/i,
      /spoiler/i,
      /accessibility|a11y|lighthouse/i,
      /screencast/i,
      /quickstart|architecture/i,
    ]
    const matched = metricLabels.filter((re) => re.test(slice.body))
    expect(matched.length).toBeGreaterThanOrEqual(5)
  })
})

describe('Feature 004 closure — task tracking', () => {
  const tasks = readFileSync(TASKS_FILE, 'utf8')
  const meta = readFileSync(META_FILE, 'utf8')

  it('master _tasks.md marks tasks 01–15 as completed', () => {
    for (let i = 1; i <= 15; i += 1) {
      const num = String(i).padStart(2, '0')
      const row = new RegExp(`\\| ${num} \\|.*\\| completed \\|`)
      expect(tasks, `task ${num} row`).toMatch(row)
    }
  })

  it('_meta.md reports Completed: 15 (or higher)', () => {
    const match = meta.match(/Completed:\s+(\d+)/)
    expect(match, '_meta.md Completed counter').not.toBeNull()
    const count = Number.parseInt(match?.[1] ?? '0', 10)
    expect(count).toBeGreaterThanOrEqual(15)
  })

  it('_meta.md frontmatter has a valid updated_at after task 15 ships', () => {
    const fm = meta.match(/^---\n([\s\S]*?)\n---/)
    expect(fm, '_meta.md frontmatter').not.toBeNull()
    const data = parseYaml(fm?.[1] ?? '') as Record<string, unknown>
    const updatedAt = data.updated_at
    expect(typeof updatedAt === 'string' || updatedAt instanceof Date).toBe(true)
  })
})

describe('Feature 004 closure — docs assets', () => {
  it('docs/screenshots/ contains ≥ 5 PNG files', () => {
    const entries = readdirSync(SCREENSHOTS_DIR)
    const pngs = entries.filter((name) => name.toLowerCase().endsWith('.png'))
    expect(pngs.length).toBeGreaterThanOrEqual(5)
  })

  it('docs/screenshots/ has all six PRD-named PNGs', () => {
    for (const required of [
      'landing-empty.png',
      'thread-with-citations.png',
      'citation-side-panel.png',
      'spoiler-slider.png',
      'library-grid.png',
      'gutendex-drawer.png',
    ]) {
      const stat = statSync(resolve(SCREENSHOTS_DIR, required))
      expect(stat.isFile(), `${required} exists`).toBe(true)
      expect(stat.size).toBeGreaterThan(0)
    }
  })

  it('docs/SCREENCAST.md exists and lists the four user-journey scenes', () => {
    const screencast = readFileSync(SCREENCAST_DOC, 'utf8')
    for (const scene of [/cold open/i, /ingest/i, /spoiler cap/i, /thread management/i]) {
      expect(screencast).toMatch(scene)
    }
  })
})
