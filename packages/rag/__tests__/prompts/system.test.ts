import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEncoding } from 'js-tiktoken'
import { beforeEach, describe, expect, it } from 'vitest'
import { _resetSystemPromptCache, loadSystemPrompt } from '../../src/prompts/loader'

const here = dirname(fileURLToPath(import.meta.url))
const SYSTEM_PROMPT_PATH = resolve(here, '../../src/prompts/system.md')

const REQUIRED_SECTION_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'identity / posture', pattern: /identity|posture/i },
  { name: 'grounding contract', pattern: /grounding|semantic_search/i },
  { name: 'citation format', pattern: /citation|\{\{cite/ },
  { name: 'language match', pattern: /language|idioma/i },
  { name: 'refusal + reformulation', pattern: /refusal|reformulation|recusa/i },
  { name: 'spoiler cap', pattern: /spoiler|cap|cap[íi]tulo/i },
]

describe('@dialogus/rag system prompt asset', () => {
  beforeEach(() => {
    _resetSystemPromptCache()
  })

  it('ships the committed Markdown asset on disk', () => {
    expect(existsSync(SYSTEM_PROMPT_PATH)).toBe(true)
  })

  it('loadSystemPrompt() returns a non-empty string', () => {
    const prompt = loadSystemPrompt()
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(0)
  })

  it('caches the prompt across calls (same reference)', () => {
    const first = loadSystemPrompt()
    const second = loadSystemPrompt()
    expect(second).toBe(first)
  })

  it('stays within the [500, 2000] token budget under cl100k_base', () => {
    const prompt = loadSystemPrompt()
    const encoder = getEncoding('cl100k_base')
    const tokens = encoder.encode(prompt).length
    expect(tokens).toBeGreaterThanOrEqual(500)
    expect(tokens).toBeLessThanOrEqual(2000)
  })

  it.each(REQUIRED_SECTION_PATTERNS)('contains the "$name" section', ({ pattern }) => {
    const prompt = loadSystemPrompt()
    expect(prompt).toMatch(pattern)
  })

  it('documents the citation marker in its canonical form', () => {
    const prompt = loadSystemPrompt()
    expect(prompt).toContain('{{cite:')
    expect(prompt).toMatch(/\{\{cite:<chunk_id>\}\}/)
  })

  it('contains no TODO or FIXME markers', () => {
    const prompt = loadSystemPrompt()
    expect(prompt).not.toMatch(/TODO/i)
    expect(prompt).not.toMatch(/FIXME/i)
  })
})
