import type { QueryClient } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chunkQueryKey } from '../../../src/components/chat/usePrefetchCitations'
import { bookQueryKey, CitationTooltip } from '../../../src/components/citation/CitationTooltip'
import { makeTestQueryClient, QueryWrapper } from '../chat/_helpers'
import { FIXTURE_CHUNK_ID, makeBook, makeChunk } from './_fixtures'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.unstubAllGlobals()
})

function renderTooltip(client: QueryClient) {
  return render(
    <QueryWrapper client={client}>
      <CitationTooltip chunkId={FIXTURE_CHUNK_ID} />
    </QueryWrapper>,
  )
}

describe('CitationTooltip', () => {
  it('renders the loading skeleton while the chunk query is pending', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    )
    const client = makeTestQueryClient()
    renderTooltip(client)
    expect(document.querySelector('[data-slot="citation-tooltip-loading"]')).not.toBeNull()
  })

  it('renders book / chapter / excerpt when both queries settle', () => {
    const client = makeTestQueryClient()
    const chunk = makeChunk()
    const book = makeBook()
    client.setQueryData(chunkQueryKey(chunk.id), chunk)
    client.setQueryData(bookQueryKey(book.id), book)

    renderTooltip(client)

    expect(screen.getByText('Memórias Póstumas de Brás Cubas')).toBeDefined()
    expect(screen.getByText('Cap. 7 — O delírio')).toBeDefined()
    expect(screen.getByText(/Era convalescente/)).toBeDefined()
  })

  it('truncates the excerpt at 200 characters with an ellipsis', () => {
    const longText = 'a'.repeat(500)
    const client = makeTestQueryClient()
    const chunk = makeChunk({ text: longText })
    client.setQueryData(chunkQueryKey(chunk.id), chunk)
    client.setQueryData(bookQueryKey(chunk.book_id), makeBook())

    renderTooltip(client)

    const excerpt = document.querySelector('[data-slot="citation-tooltip-excerpt"]')
    expect(excerpt).not.toBeNull()
    expect(excerpt?.textContent ?? '').toContain('…')
    expect((excerpt?.textContent ?? '').length).toBeLessThanOrEqual(201)
  })

  it('renders the error state when the chunk query fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('boom'))),
    )
    const client = makeTestQueryClient()
    renderTooltip(client)

    expect(await screen.findByText('Erro ao carregar citação')).toBeDefined()
    expect(screen.getByLabelText('Tentar novamente')).toBeDefined()
  })
})
