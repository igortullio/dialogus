import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chunkQueryKey } from '../../../src/components/chat/usePrefetchCitations'
import { CitationSidePanel } from '../../../src/components/citation/CitationSidePanel'
import { bookQueryKey } from '../../../src/components/citation/CitationTooltip'
import {
  _resetCitationPanelForTests,
  openCitationPanel,
  openUnresolvedPanel,
} from '../../../src/components/citation/citation-panel-state'
import { makeTestQueryClient, QueryWrapper } from '../chat/_helpers'
import { makeBook, makeChunk } from './_fixtures'

let originalMatchMedia: typeof window.matchMedia | undefined

function installMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({
      matches,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  })
}

beforeEach(() => {
  originalMatchMedia = window.matchMedia
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => undefined)),
  )
})

afterEach(() => {
  cleanup()
  _resetCitationPanelForTests()
  if (originalMatchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    })
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CitationSidePanel', () => {
  it('renders nothing when no panel is open', () => {
    installMatchMedia(true)
    const client = makeTestQueryClient()
    render(
      <QueryWrapper client={client}>
        <CitationSidePanel />
      </QueryWrapper>,
    )
    expect(document.querySelector('[data-slot="citation-side-panel"]')).toBeNull()
  })

  it('renders the chunk panel content from cached chunk + book queries', () => {
    installMatchMedia(true)
    const client = makeTestQueryClient()
    const chunk = makeChunk()
    const book = makeBook()
    client.setQueryData(chunkQueryKey(chunk.id), chunk)
    client.setQueryData(bookQueryKey(book.id), book)

    render(
      <QueryWrapper client={client}>
        <CitationSidePanel />
      </QueryWrapper>,
    )

    act(() => {
      openCitationPanel(chunk.id)
    })

    const panel = document.querySelector('[data-slot="citation-side-panel"]')
    expect(panel).not.toBeNull()
    expect(panel?.getAttribute('data-panel-kind')).toBe('chunk')
    expect(panel?.getAttribute('data-panel-side')).toBe('right')
    expect(screen.getByText('Memórias Póstumas de Brás Cubas')).toBeDefined()
    expect(screen.getByText('Cap. 7 — O delírio')).toBeDefined()
    expect(document.body.textContent).toContain('Era convalescente')
  })

  it('renders the explanatory unresolved panel when openUnresolvedPanel is called', () => {
    installMatchMedia(true)
    const client = makeTestQueryClient()
    render(
      <QueryWrapper client={client}>
        <CitationSidePanel />
      </QueryWrapper>,
    )

    act(() => {
      openUnresolvedPanel()
    })

    const panel = document.querySelector('[data-slot="citation-side-panel"]')
    expect(panel).not.toBeNull()
    expect(panel?.getAttribute('data-panel-kind')).toBe('unresolved')
    expect(screen.getByText('Citação não-resolvida')).toBeDefined()
    expect(
      screen.getByText(/Esta citação faz referência a um trecho que não foi encontrado/),
    ).toBeDefined()
  })

  it('uses side="bottom" below the 1024px breakpoint (mobile)', () => {
    installMatchMedia(false)
    const client = makeTestQueryClient()
    const chunk = makeChunk()
    client.setQueryData(chunkQueryKey(chunk.id), chunk)
    client.setQueryData(bookQueryKey(chunk.book_id), makeBook())

    render(
      <QueryWrapper client={client}>
        <CitationSidePanel />
      </QueryWrapper>,
    )
    act(() => {
      openCitationPanel(chunk.id)
    })

    const panel = document.querySelector('[data-slot="citation-side-panel"]')
    expect(panel?.getAttribute('data-panel-side')).toBe('bottom')
  })

  it('does NOT close on outside pointer down (preventDefault on pointer-down-outside)', () => {
    installMatchMedia(true)
    const client = makeTestQueryClient()
    const chunk = makeChunk()
    client.setQueryData(chunkQueryKey(chunk.id), chunk)
    client.setQueryData(bookQueryKey(chunk.book_id), makeBook())

    render(
      <QueryWrapper client={client}>
        <CitationSidePanel />
      </QueryWrapper>,
    )
    act(() => {
      openCitationPanel(chunk.id)
    })

    const panel = document.querySelector('[data-slot="citation-side-panel"]')
    expect(panel).not.toBeNull()
    // Simulate the outside-click that Radix would fire — preventDefault on the
    // pointer-down-outside event keeps the sheet open.
    const overlay = document.querySelector('[data-slot="sheet-overlay"]')
    if (overlay) fireEvent.pointerDown(overlay)

    expect(document.querySelector('[data-slot="citation-side-panel"]')).not.toBeNull()
  })

  it('renders the loading skeleton when the chunk is not yet cached', () => {
    installMatchMedia(true)
    const client = makeTestQueryClient()

    render(
      <QueryWrapper client={client}>
        <CitationSidePanel />
      </QueryWrapper>,
    )
    act(() => {
      openCitationPanel('chunk-uncached')
    })

    expect(document.querySelector('[data-slot="citation-side-panel-loading"]')).not.toBeNull()
  })
})
