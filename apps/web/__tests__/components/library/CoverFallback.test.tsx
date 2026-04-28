import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { _internals, CoverFallback } from '../../../src/components/library/CoverFallback'

afterEach(() => {
  cleanup()
})

describe('CoverFallback', () => {
  it('renders an SVG with aria-label populated from the title', () => {
    render(<CoverFallback title="Memórias Póstumas" author="Machado" />)
    const svg = screen.getByRole('img')
    expect(svg.getAttribute('aria-label')).toBe("Capa de 'Memórias Póstumas'")
  })

  it('uses a 2:3 viewBox (book-cover aspect ratio)', () => {
    render(<CoverFallback title="X" />)
    const svg = screen.getByRole('img')
    const viewBox = svg.getAttribute('viewBox') ?? ''
    const parts = viewBox.split(' ').map((token) => Number.parseFloat(token))
    expect(parts.length).toBe(4)
    const [, , width, height] = parts as [number, number, number, number]
    expect(Number.isFinite(width)).toBe(true)
    expect(Number.isFinite(height)).toBe(true)
    expect(height / width).toBeCloseTo(1.5, 5)
  })

  it('produces deterministic palette index for the same title', () => {
    const a = _internals.paletteIndex('Crime and Punishment')
    const b = _internals.paletteIndex('Crime and Punishment')
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(_internals.PALETTE_SIZE)
  })

  it('produces different palette indices across diverse titles most of the time', () => {
    const titles = [
      'The Count of Monte Cristo',
      'Memórias Póstumas de Brás Cubas',
      'Crime and Punishment',
      'War and Peace',
      'Anna Karenina',
      'Dom Quixote',
      'Os Lusíadas',
      'Hamlet',
      'Don Juan',
      'The Idiot',
    ]
    const indices = new Set(titles.map(_internals.paletteIndex))
    expect(indices.size).toBeGreaterThanOrEqual(4)
  })

  it('falls back to "Sem título" when title is empty', () => {
    render(<CoverFallback title="" />)
    const svg = screen.getByRole('img')
    expect(svg.getAttribute('aria-label')).toBe("Capa de 'Sem título'")
  })

  it('renders the author footer when provided', () => {
    render(<CoverFallback title="Hamlet" author="Shakespeare" />)
    const author = document.querySelector('[data-slot="cover-fallback-author"]')
    expect(author?.textContent).toBe('Shakespeare')
  })

  it('omits the author footer when not provided', () => {
    render(<CoverFallback title="Hamlet" />)
    const author = document.querySelector('[data-slot="cover-fallback-author"]')
    expect(author).toBeNull()
  })

  it('truncates very long author names', () => {
    const longAuthor = 'A'.repeat(80)
    const truncated = _internals.truncate(longAuthor, 36)
    expect(truncated.length).toBe(36)
    expect(truncated.endsWith('…')).toBe(true)
  })

  it('wraps long titles into multiple lines (max 4)', () => {
    const longTitle = 'palavra '.repeat(20).trim()
    const lines = _internals.wrapTitle(longTitle)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.length).toBeLessThanOrEqual(4)
  })

  it('exposes the chosen palette index as a data attribute', () => {
    render(<CoverFallback title="Anna Karenina" />)
    const svg = screen.getByRole('img')
    const attr = svg.getAttribute('data-palette-index')
    const value = Number.parseInt(attr ?? '-1', 10)
    expect(value).toBe(_internals.paletteIndex('Anna Karenina'))
  })
})
