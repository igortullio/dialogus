import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _resetCitationPanelForTests,
  useUnresolvedPanel,
} from '../../../src/components/citation/citation-panel-state'
import { UnresolvedCitationBadge } from '../../../src/components/citation/UnresolvedCitationBadge'

afterEach(() => {
  cleanup()
  _resetCitationPanelForTests()
})

function UnresolvedProbe() {
  const { isOpen } = useUnresolvedPanel()
  return <span data-testid="unresolved-probe">{isOpen ? 'open' : 'closed'}</span>
}

describe('UnresolvedCitationBadge', () => {
  it('renders a <sup> with a warning button + accessible label', () => {
    render(<UnresolvedCitationBadge />)
    const sup = document.querySelector('sup[data-slot="unresolved-citation-badge"]')
    expect(sup).not.toBeNull()
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-label')).toBe('Citação não-resolvida')
  })

  it('renders an SVG glyph (lucide TriangleAlert) inside the button', () => {
    render(<UnresolvedCitationBadge />)
    const svg = document.querySelector('sup[data-slot="unresolved-citation-badge"] svg')
    expect(svg).not.toBeNull()
  })

  it('clicking the badge opens the unresolved panel via shared state', () => {
    render(
      <>
        <UnresolvedCitationBadge />
        <UnresolvedProbe />
      </>,
    )
    expect(screen.getByTestId('unresolved-probe').textContent).toBe('closed')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByTestId('unresolved-probe').textContent).toBe('open')
  })
})
