import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chunkQueryKey } from '../../../src/components/chat/usePrefetchCitations'
import { CitationBadge } from '../../../src/components/citation/CitationBadge'
import { bookQueryKey } from '../../../src/components/citation/CitationTooltip'
import {
  _resetCitationPanelForTests,
  useCitationPanel,
} from '../../../src/components/citation/citation-panel-state'
import { makeTestQueryClient, QueryWrapper } from '../chat/_helpers'
import { FIXTURE_CHUNK_ID, makeBook, makeChunk } from './_fixtures'

afterEach(() => {
  cleanup()
  _resetCitationPanelForTests()
})

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => undefined)),
  )
})

const BADGE_PROPS = {
  chunkId: FIXTURE_CHUNK_ID,
  index: 1,
  threadId: 'thread-1',
  messageId: 'msg-1',
}

function StateProbe({ targetId }: { readonly targetId?: string }) {
  const { openChunkId } = useCitationPanel()
  return (
    <span data-testid={`probe-${targetId ?? 'default'}`} data-open-chunk-id={openChunkId ?? 'null'}>
      {openChunkId ?? 'null'}
    </span>
  )
}

describe('CitationBadge', () => {
  it('renders <sup> with the index number', () => {
    const client = makeTestQueryClient()
    render(
      <QueryWrapper client={client}>
        <CitationBadge {...BADGE_PROPS} />
      </QueryWrapper>,
    )
    const sup = document.querySelector('sup[data-slot="citation-badge"]')
    expect(sup).not.toBeNull()
    expect(sup?.getAttribute('data-citation-index')).toBe('1')
    expect(sup?.getAttribute('data-chunk-id')).toBe(FIXTURE_CHUNK_ID)
    expect(sup?.getAttribute('data-thread-id')).toBe('thread-1')
    expect(sup?.getAttribute('data-message-id')).toBe('msg-1')
    expect(sup?.textContent).toContain('1')
  })

  it('builds the aria-label from the prefetched chunk + book cache', () => {
    const client = makeTestQueryClient()
    const chunk = makeChunk()
    client.setQueryData(chunkQueryKey(chunk.id), chunk)
    client.setQueryData(bookQueryKey(chunk.book_id), makeBook())

    render(
      <QueryWrapper client={client}>
        <CitationBadge {...BADGE_PROPS} chunkId={chunk.id} index={2} />
      </QueryWrapper>,
    )

    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-label')).toBe(
      'Citação 2: capítulo 7 de Memórias Póstumas de Brás Cubas',
    )
  })

  it('falls back to a generic aria-label when the cache is empty', () => {
    const client = makeTestQueryClient()
    render(
      <QueryWrapper client={client}>
        <CitationBadge {...BADGE_PROPS} index={5} />
      </QueryWrapper>,
    )
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-label')).toBe('Citação 5')
  })

  it('clicking the badge sets useCitationPanel.openChunkId to the chunkId', () => {
    const client = makeTestQueryClient()
    render(
      <QueryWrapper client={client}>
        <CitationBadge {...BADGE_PROPS} chunkId="chunk-X" />
        <StateProbe />
      </QueryWrapper>,
    )
    expect(screen.getByTestId('probe-default').getAttribute('data-open-chunk-id')).toBe('null')

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByTestId('probe-default').getAttribute('data-open-chunk-id')).toBe('chunk-X')
  })

  it('opening a different chunk replaces the previous open chunk (single panel)', () => {
    const client = makeTestQueryClient()
    render(
      <QueryWrapper client={client}>
        <CitationBadge {...BADGE_PROPS} chunkId="chunk-A" />
        <CitationBadge {...BADGE_PROPS} chunkId="chunk-B" index={2} messageId="msg-2" />
        <StateProbe />
      </QueryWrapper>,
    )
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0] as HTMLElement)
    fireEvent.click(buttons[1] as HTMLElement)
    expect(screen.getByTestId('probe-default').getAttribute('data-open-chunk-id')).toBe('chunk-B')
  })
})
