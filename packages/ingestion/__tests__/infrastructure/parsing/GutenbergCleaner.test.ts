import { describe, expect, it } from 'vitest'
import { clean, GutenbergCleaner } from '../../../src/infrastructure/parsing/GutenbergCleaner'

describe('GutenbergCleaner.clean', () => {
  it('exposes a named export plus a namespace handle', () => {
    expect(typeof clean).toBe('function')
    expect(GutenbergCleaner.clean).toBe(clean)
  })

  it('strips everything before the START marker (THE variant)', () => {
    const raw = [
      'License preamble line 1',
      'License preamble line 2',
      '*** START OF THE PROJECT GUTENBERG EBOOK MOBY DICK ***',
      'Body line 1',
      'Body line 2',
    ].join('\n')
    const result = clean(raw)
    expect(result).not.toContain('License preamble')
    expect(result).toContain('Body line 1')
    expect(result).toContain('Body line 2')
  })

  it('strips everything after the END marker (THE variant)', () => {
    const raw = [
      '*** START OF THE PROJECT GUTENBERG EBOOK MOBY DICK ***',
      'Body line 1',
      '*** END OF THE PROJECT GUTENBERG EBOOK MOBY DICK ***',
      'Donations boilerplate',
      'License tail',
    ].join('\n')
    const result = clean(raw)
    expect(result).toContain('Body line 1')
    expect(result).not.toContain('Donations')
    expect(result).not.toContain('License tail')
  })

  it('handles the THIS variant of the marker', () => {
    const raw = [
      'PRE',
      '*** START OF THIS PROJECT GUTENBERG EBOOK ABC ***',
      'Body',
      '*** END OF THIS PROJECT GUTENBERG EBOOK ABC ***',
      'POST',
    ].join('\n')
    const result = clean(raw)
    expect(result).toBe('Body')
  })

  it('handles the bare PROJECT GUTENBERG EBOOK variant (no THE/THIS)', () => {
    const raw = [
      'PRE',
      '*** START OF PROJECT GUTENBERG EBOOK ABC ***',
      'Body',
      '*** END OF PROJECT GUTENBERG EBOOK ABC ***',
      'POST',
    ].join('\n')
    const result = clean(raw)
    expect(result).toBe('Body')
  })

  it('matches markers case-insensitively', () => {
    const raw = [
      'PRE',
      '*** start of the project gutenberg ebook abc ***',
      'Body',
      '*** end of the project gutenberg ebook abc ***',
      'POST',
    ].join('\n')
    const result = clean(raw)
    expect(result).toBe('Body')
  })

  it('normalizes 4+ blank lines to a maximum of 2 blank lines', () => {
    const raw = ['A', '', '', '', '', '', '', 'B'].join('\n')
    const result = clean(raw)
    // 2 blank lines = exactly 3 newlines between A and B
    expect(result).toBe('A\n\n\nB')
  })

  it('returns text with trimmed boundaries when no markers are present', () => {
    const raw = '\n\n   Body line\n\n'
    const result = clean(raw)
    expect(result).toBe('Body line')
  })

  it('does not throw on empty input', () => {
    expect(clean('')).toBe('')
  })

  it('preserves chapter markers inside the body', () => {
    const raw = [
      '*** START OF THE PROJECT GUTENBERG EBOOK X ***',
      'CHAPTER I.',
      'Para 1',
      '',
      'CHAPTER II.',
      'Para 2',
      '*** END OF THE PROJECT GUTENBERG EBOOK X ***',
    ].join('\n')
    const result = clean(raw)
    expect(result).toContain('CHAPTER I.')
    expect(result).toContain('CHAPTER II.')
  })
})
