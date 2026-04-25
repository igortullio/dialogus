import { afterEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import {
  _resetChapterHeuristicsCache,
  ChapterHeuristicsSchema,
  loadChapterHeuristics,
  parseChapterHeuristics,
} from '../../../src/infrastructure/parsing/chapter-heuristics'

afterEach(() => {
  _resetChapterHeuristicsCache()
})

describe('loadChapterHeuristics', () => {
  it('parses the bundled YAML and exposes RegExp[] for each language', () => {
    const config = loadChapterHeuristics()
    expect(config.en.patterns.length).toBeGreaterThanOrEqual(3)
    expect(config.pt.patterns.length).toBeGreaterThanOrEqual(3)
    for (const pattern of [...config.en.patterns, ...config.pt.patterns]) {
      expect(pattern).toBeInstanceOf(RegExp)
      expect(pattern.flags).toContain('i')
    }
    expect(config.en.fallbackTitle.length).toBeGreaterThan(0)
    expect(config.pt.fallbackTitle.length).toBeGreaterThan(0)
  })

  it('returns the same singleton instance on repeated calls', () => {
    const first = loadChapterHeuristics()
    const second = loadChapterHeuristics()
    expect(second).toBe(first)
  })

  it('matches representative chapter heading lines', () => {
    const config = loadChapterHeuristics()
    expect(config.en.patterns.some((p) => p.test('CHAPTER I.'))).toBe(true)
    expect(config.en.patterns.some((p) => p.test('Chapter 1'))).toBe(true)
    expect(config.pt.patterns.some((p) => p.test('CAPÍTULO I'))).toBe(true)
    expect(config.pt.patterns.some((p) => p.test('Capítulo 1'))).toBe(true)
    expect(config.pt.patterns.some((p) => p.test('PARTE I'))).toBe(true)
  })
})

describe('parseChapterHeuristics', () => {
  it('returns compiled patterns when YAML is valid', () => {
    const yamlText = `
en:
  patterns:
    - '^Chapter\\s+\\d+'
  fallback_title: 'Full text'
pt:
  patterns:
    - '^Cap[íi]tulo\\s+\\d+'
  fallback_title: 'Texto completo'
`
    const config = parseChapterHeuristics(yamlText)
    expect(config.en.patterns[0]?.test('Chapter 7')).toBe(true)
    expect(config.pt.patterns[0]?.test('Capítulo 12')).toBe(true)
  })

  it('throws a ZodError naming missing fields when en.patterns is absent', () => {
    const yamlText = `
en:
  fallback_title: 'Full text'
pt:
  patterns:
    - '^Cap[íi]tulo\\s+\\d+'
  fallback_title: 'Texto completo'
`
    let caught: unknown
    try {
      parseChapterHeuristics(yamlText)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ZodError)
    const message = (caught as ZodError).issues.map((i) => i.path.join('.')).join(',')
    expect(message).toContain('en.patterns')
  })

  it('throws when a pattern is not a compilable RegExp (unbalanced paren)', () => {
    const yamlText = `
en:
  patterns:
    - '^Chapter\\s+\\d+'
    - '(unbalanced'
  fallback_title: 'Full text'
pt:
  patterns:
    - '^Cap[íi]tulo\\s+\\d+'
  fallback_title: 'Texto completo'
`
    expect(() => parseChapterHeuristics(yamlText)).toThrow(/invalid pattern/i)
  })

  it('rejects empty patterns array via Zod', () => {
    const yamlText = `
en:
  patterns: []
  fallback_title: 'Full text'
pt:
  patterns:
    - '^Cap[íi]tulo\\s+\\d+'
  fallback_title: 'Texto completo'
`
    expect(() => parseChapterHeuristics(yamlText)).toThrow(ZodError)
  })
})

describe('ChapterHeuristicsSchema', () => {
  it('exports the Zod schema for external composition', () => {
    expect(ChapterHeuristicsSchema).toBeDefined()
    const result = ChapterHeuristicsSchema.safeParse({
      en: { patterns: ['^x$'], fallback_title: 'a' },
      pt: { patterns: ['^y$'], fallback_title: 'b' },
    })
    expect(result.success).toBe(true)
  })
})
