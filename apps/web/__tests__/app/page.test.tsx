import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Page from '../../src/app/page'

describe('apps/web placeholder Page', () => {
  it('renders a single <h1> with the text "dIAlogus"', () => {
    const { container } = render(<Page />)
    const heading = container.querySelector('h1')
    expect(heading).not.toBeNull()
    expect(heading?.textContent).toBe('dIAlogus')
  })

  it('does not declare a "use client" directive (server component placeholder)', () => {
    const source = readFileSync(join(__dirname, '../../src/app/page.tsx'), 'utf8')
    expect(source).not.toMatch(/['"]use client['"]/)
  })
})
