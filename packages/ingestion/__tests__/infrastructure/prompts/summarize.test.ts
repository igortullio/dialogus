import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEncoding } from 'js-tiktoken'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const PROMPT_PATH = join(here, '..', '..', '..', 'src', 'infrastructure', 'prompts', 'summarize.md')

const REQUIRED_SECTIONS = ['Tone', 'Language', 'Length', 'Format'] as const

describe('summarize.md prompt asset', () => {
  it('exists at packages/ingestion/src/infrastructure/prompts/summarize.md', () => {
    expect(existsSync(PROMPT_PATH)).toBe(true)
  })

  it.each(REQUIRED_SECTIONS)('contains the "%s" section heading', (section) => {
    const content = readFileSync(PROMPT_PATH, 'utf8')
    const heading = new RegExp(`^##\\s+${section}\\b`, 'm')
    expect(content).toMatch(heading)
  })

  it('mentions the 150-300 word length target', () => {
    const content = readFileSync(PROMPT_PATH, 'utf8')
    expect(content).toMatch(/150/)
    expect(content).toMatch(/300/)
  })

  it('encodes to ≤ 1500 cl100k_base tokens', () => {
    const content = readFileSync(PROMPT_PATH, 'utf8')
    const encoder = getEncoding('cl100k_base')
    const tokenCount = encoder.encode(content).length
    expect(tokenCount).toBeLessThanOrEqual(1500)
  })
})
