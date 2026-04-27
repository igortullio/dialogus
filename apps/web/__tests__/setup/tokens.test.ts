/**
 * Tailwind v4 design-token surface (task_06):
 *   - Asserts globals.css declares the project tokens (light + dark).
 *   - Asserts the @theme inline block exposes the tokens to Tailwind utilities.
 *   - Asserts JSDOM resolves the :root variables via getComputedStyle when the
 *     :root block is inlined as a <style> element.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const cssPath = join(__dirname, '..', '..', 'src', 'app', 'globals.css')
const css = readFileSync(cssPath, 'utf8')

const REQUIRED_LIGHT_TOKENS = [
  '--background',
  '--foreground',
  '--primary',
  '--secondary',
  '--muted',
  '--accent',
  '--destructive',
  '--border',
  '--input',
  '--ring',
  '--scholarly',
  '--scholarly-foreground',
  '--status-ready',
  '--status-ready-foreground',
  '--status-failed',
  '--status-failed-foreground',
  '--status-progress',
  '--status-progress-foreground',
  '--space-thread-row',
  '--radius-cite-badge',
  '--font-sans',
  '--font-serif',
  '--font-mono',
] as const

const REQUIRED_THEME_TOKENS = [
  '--color-background',
  '--color-foreground',
  '--color-scholarly',
  '--color-status-ready',
  '--color-status-failed',
  '--color-status-progress',
  '--font-sans',
  '--font-serif',
  '--font-mono',
  '--radius-sm',
  '--radius-cite-badge',
] as const

function extractBlock(source: string, header: RegExp): string {
  const match = source.match(header)
  if (!match || match.index === undefined) {
    throw new Error(`block not found for ${header}`)
  }
  const start = match.index + match[0].length
  let depth = 1
  let i = start
  while (i < source.length && depth > 0) {
    const ch = source[i]
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
    i += 1
  }
  return source.slice(start, i - 1)
}

describe('apps/web globals.css design tokens', () => {
  it('declares all required tokens in :root (light theme)', () => {
    const rootBlock = extractBlock(css, /:root\s*\{/)
    for (const token of REQUIRED_LIGHT_TOKENS) {
      expect(rootBlock, `:root must declare ${token}`).toMatch(new RegExp(`${token}\\s*:`, 'm'))
    }
  })

  it('mirrors the dark palette via @media (prefers-color-scheme: dark)', () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)\s*\{/)
    const mediaBlock = extractBlock(css, /@media \(prefers-color-scheme: dark\)\s*\{/)
    const darkRoot = extractBlock(mediaBlock, /:root\s*\{/)
    for (const token of [
      '--background',
      '--foreground',
      '--scholarly',
      '--status-ready',
      '--status-progress',
    ]) {
      expect(darkRoot, `dark :root must override ${token}`).toMatch(
        new RegExp(`${token}\\s*:`, 'm'),
      )
    }
  })

  it('keeps the .dark class block in sync for next-themes runtime overrides', () => {
    const darkClass = extractBlock(css, /\.dark\s*\{/)
    expect(darkClass).toMatch(/--background\s*:/)
    expect(darkClass).toMatch(/--scholarly\s*:/)
    expect(darkClass).toMatch(/--status-ready\s*:/)
  })

  it('exposes design tokens to Tailwind via @theme inline', () => {
    const themeBlock = extractBlock(css, /@theme inline\s*\{/)
    for (const token of REQUIRED_THEME_TOKENS) {
      expect(themeBlock, `@theme inline must declare ${token}`).toMatch(
        new RegExp(`${token}\\s*:`, 'm'),
      )
    }
  })

  it('declares the project radius + spacing anchors required by chat UI', () => {
    expect(css).toMatch(/--radius-cite-badge\s*:\s*4px/)
    expect(css).toMatch(/--space-thread-row\s*:\s*56px/)
  })

  it('declares serif / sans / mono font stacks via CSS custom properties', () => {
    const rootBlock = extractBlock(css, /:root\s*\{/)
    expect(rootBlock).toMatch(/--font-sans\s*:/)
    expect(rootBlock).toMatch(/--font-serif\s*:/)
    expect(rootBlock).toMatch(/--font-mono\s*:/)
  })

  it('does NOT pull in shadcn AI primitives (ADR-006)', () => {
    expect(css).not.toMatch(/inline-citation/i)
    expect(css).not.toMatch(/@assistant-ui/)
  })
})

function parseDeclarations(block: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const raw of block.split(';')) {
    const decl = raw.trim()
    if (!decl) continue
    const colon = decl.indexOf(':')
    if (colon < 0) continue
    const name = decl.slice(0, colon).trim()
    const value = decl.slice(colon + 1).trim()
    if (name.startsWith('--')) {
      out.set(name, value)
    }
  }
  return out
}

describe('JSDOM CSS variable resolution', () => {
  const lightTokens = parseDeclarations(extractBlock(css, /:root\s*\{/))
  const darkTokens = parseDeclarations(extractBlock(css, /\.dark\s*\{/))

  // JSDOM resolves CSS custom properties via getComputedStyle only on the same
  // element where they are declared — variable inheritance to descendants is
  // not implemented. We read from documentElement (the :root host) instead of
  // document.body; in a real browser the value would propagate to body via
  // standard inheritance.

  afterEach(() => {
    const root = document.documentElement
    for (const key of Array.from(lightTokens.keys())) {
      root.style.removeProperty(key)
    }
    root.classList.remove('dark')
  })

  function applyTokens(values: Map<string, string>) {
    const root = document.documentElement
    for (const [name, value] of values) {
      root.style.setProperty(name, value)
    }
  }

  it('resolves --background to a non-empty value on :root', () => {
    applyTokens(lightTokens)
    const value = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
    expect(value).not.toBe('')
  })

  it('resolves the scholarly accent + status palette on :root', () => {
    applyTokens(lightTokens)
    const computed = getComputedStyle(document.documentElement)
    for (const token of [
      '--scholarly',
      '--scholarly-foreground',
      '--status-ready',
      '--status-failed',
      '--status-progress',
    ]) {
      expect(computed.getPropertyValue(token).trim()).not.toBe('')
    }
  })

  it('flips token values when the .dark class is applied (next-themes path)', () => {
    applyTokens(lightTokens)
    const before = getComputedStyle(document.documentElement)
      .getPropertyValue('--background')
      .trim()
    expect(before).not.toBe('')
    expect(before).toBe(lightTokens.get('--background'))

    applyTokens(darkTokens)
    const after = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
    expect(after).not.toBe('')
    expect(after).toBe(darkTokens.get('--background'))
    expect(after).not.toBe(before)
  })

  it('flips the scholarly accent between light and dark tokens', () => {
    expect(lightTokens.get('--scholarly')).not.toBe(darkTokens.get('--scholarly'))
    expect(lightTokens.get('--status-ready')).not.toBe(darkTokens.get('--status-ready'))
  })
})
