import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/lib/api/catalog', () => ({
  searchGutendex: vi.fn(),
}))

vi.mock('../../../src/lib/api/library', () => ({
  addBook: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import {
  _resetAddBookDrawerForTests,
  closeAddBookDrawer,
  openAddBookDrawer,
} from '../../../src/components/chat/add-book-drawer-store'
import { AddGutendexSheet } from '../../../src/components/library/AddGutendexSheet'
import type { Book, GutendexBook } from '../../../src/lib/api/_schemas'
import type { SearchGutendexResult } from '../../../src/lib/api/catalog'
import { searchGutendex } from '../../../src/lib/api/catalog'
import { addBook } from '../../../src/lib/api/library'

const mockedSearch = vi.mocked(searchGutendex)
const mockedAdd = vi.mocked(addBook)

import { toast } from 'sonner'

const mockedToastError = vi.mocked(toast.error)

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60_000, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

function Wrap({
  client,
  children,
}: {
  readonly client: QueryClient
  readonly children: ReactNode
}) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function makeGutendexBook(overrides: Partial<GutendexBook> = {}): GutendexBook {
  return {
    id: 1184,
    title: 'The Count of Monte Cristo',
    authors: [{ name: 'Alexandre Dumas', birth_year: null, death_year: null }],
    languages: ['en'],
    subjects: ['Adventure'],
    download_url_epub: null,
    download_url_txt: null,
    cover_url: null,
    ...overrides,
  }
}

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    gutendex_id: 1184,
    title: 'The Count of Monte Cristo',
    authors: [{ name: 'Alexandre Dumas', birth_year: null, death_year: null }],
    languages: ['en'],
    subjects: [],
    download_url_epub: null,
    download_url_txt: null,
    cover_url: null,
    raw_hash: null,
    ingestion_status: 'discovered',
    ingestion_error: null,
    tags: [],
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

function makeSearchResult(
  books: GutendexBook[],
  nextCursor: string | null = null,
): SearchGutendexResult {
  return { books, nextCursor, count: books.length }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  _resetAddBookDrawerForTests()
  mockedSearch.mockReset()
  mockedAdd.mockReset()
  mockedToastError.mockReset()
})

afterEach(() => {
  cleanup()
  _resetAddBookDrawerForTests()
  vi.useRealTimers()
})

async function flushDebounce(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350)
  })
}

describe('AddGutendexSheet', () => {
  it('does not render the sheet content when closed', () => {
    render(
      <Wrap client={makeClient()}>
        <AddGutendexSheet />
      </Wrap>,
    )
    expect(document.querySelector('[data-slot="add-gutendex-sheet"]')).toBeNull()
  })

  it('opens when openAddBookDrawer fires and renders the search input', async () => {
    mockedSearch.mockResolvedValue(makeSearchResult([]))
    render(
      <Wrap client={makeClient()}>
        <AddGutendexSheet />
      </Wrap>,
    )
    act(() => {
      openAddBookDrawer()
    })
    await waitFor(() => {
      expect(document.querySelector('[data-slot="add-gutendex-sheet"]')).not.toBeNull()
    })
    const input = document.querySelector(
      '[data-slot="add-gutendex-search"]',
    ) as HTMLInputElement | null
    expect(input).not.toBeNull()
  })

  it('debounces search input by 300ms before calling searchGutendex with the query', async () => {
    mockedSearch.mockResolvedValue(makeSearchResult([makeGutendexBook()]))
    render(
      <Wrap client={makeClient()}>
        <AddGutendexSheet />
      </Wrap>,
    )
    act(() => {
      openAddBookDrawer()
    })
    await waitFor(() => {
      expect(document.querySelector('[data-slot="add-gutendex-search"]')).not.toBeNull()
    })
    await flushDebounce()
    await waitFor(() => {
      expect(mockedSearch).toHaveBeenCalled()
    })
    mockedSearch.mockClear()
    const input = document.querySelector('[data-slot="add-gutendex-search"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'tolstoy' } })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    expect(mockedSearch).not.toHaveBeenCalled()
    await flushDebounce()
    await waitFor(() => {
      expect(mockedSearch).toHaveBeenCalled()
    })
    const params = mockedSearch.mock.calls[0]?.[0] ?? {}
    expect(params.q).toBe('tolstoy')
  })

  it('language filter chip toggles the language sent to searchGutendex', async () => {
    mockedSearch.mockResolvedValue(makeSearchResult([makeGutendexBook()]))
    render(
      <Wrap client={makeClient()}>
        <AddGutendexSheet />
      </Wrap>,
    )
    act(() => {
      openAddBookDrawer()
    })
    await flushDebounce()
    await waitFor(() => {
      expect(mockedSearch).toHaveBeenCalled()
    })
    mockedSearch.mockClear()
    const enChip = document.querySelector(
      '[data-slot="add-gutendex-filter-chip"][data-language="en"]',
    ) as HTMLButtonElement
    await act(async () => {
      fireEvent.click(enChip)
    })
    await flushDebounce()
    await waitFor(() => {
      expect(mockedSearch).toHaveBeenCalled()
    })
    const params = mockedSearch.mock.calls[0]?.[0] ?? {}
    expect(params.language).toBe('en')
  })

  it('renders search results returned from searchGutendex', async () => {
    mockedSearch.mockResolvedValue(
      makeSearchResult([
        makeGutendexBook({ id: 1, title: 'Anna Karenina' }),
        makeGutendexBook({ id: 2, title: 'War and Peace' }),
      ]),
    )
    render(
      <Wrap client={makeClient()}>
        <AddGutendexSheet />
      </Wrap>,
    )
    act(() => {
      openAddBookDrawer()
    })
    await flushDebounce()
    await waitFor(() => {
      expect(document.querySelectorAll('[data-slot="add-gutendex-row"]').length).toBe(2)
    })
  })

  it('"Adicionar" calls addBook with the gutendex id and updates the row to "Adicionado"', async () => {
    const client = makeClient()
    mockedSearch.mockResolvedValue(makeSearchResult([makeGutendexBook({ id: 42 })]))
    mockedAdd.mockResolvedValueOnce(makeBook({ gutendex_id: 42 }))
    render(
      <Wrap client={client}>
        <AddGutendexSheet />
      </Wrap>,
    )
    act(() => {
      openAddBookDrawer()
    })
    await flushDebounce()
    const addButton = await waitFor(() => {
      const node = document.querySelector(
        '[data-slot="add-gutendex-row-add"]',
      ) as HTMLButtonElement | null
      if (!node) throw new Error('add button not found')
      return node
    })
    await act(async () => {
      fireEvent.click(addButton)
    })
    await waitFor(() => {
      expect(mockedAdd).toHaveBeenCalled()
    })
    expect(mockedAdd.mock.calls[0]?.[0]).toBe(42)
    expect(mockedAdd.mock.calls[0]?.[1]).toEqual(expect.any(String))
    await waitFor(() => {
      const status = document.querySelector('[data-slot="add-gutendex-row-status"]')
      expect(status?.textContent).toContain('Adicionado')
    })
  })

  it('on add error: row enters error state and toast fires', async () => {
    mockedSearch.mockResolvedValue(makeSearchResult([makeGutendexBook({ id: 99 })]))
    mockedAdd.mockRejectedValueOnce(new Error('boom'))
    render(
      <Wrap client={makeClient()}>
        <AddGutendexSheet />
      </Wrap>,
    )
    act(() => {
      openAddBookDrawer()
    })
    await flushDebounce()
    const addButton = await waitFor(() => {
      const node = document.querySelector(
        '[data-slot="add-gutendex-row-add"]',
      ) as HTMLButtonElement | null
      if (!node) throw new Error('add button not found')
      return node
    })
    await act(async () => {
      fireEvent.click(addButton)
    })
    await waitFor(() => {
      expect(mockedToastError).toHaveBeenCalled()
    })
    await waitFor(() => {
      const row = document.querySelector('[data-slot="add-gutendex-row"]') as HTMLElement | null
      expect(row?.dataset.state).toBe('error')
    })
  })

  it('"Carregar mais" appends the next page', async () => {
    mockedSearch.mockResolvedValueOnce(
      makeSearchResult([makeGutendexBook({ id: 1, title: 'A' })], 'cursor-2'),
    )
    mockedSearch.mockResolvedValueOnce(makeSearchResult([makeGutendexBook({ id: 2, title: 'B' })]))
    render(
      <Wrap client={makeClient()}>
        <AddGutendexSheet />
      </Wrap>,
    )
    act(() => {
      openAddBookDrawer()
    })
    await flushDebounce()
    await waitFor(() => {
      expect(document.querySelectorAll('[data-slot="add-gutendex-row"]').length).toBe(1)
    })
    const loadMore = document.querySelector(
      '[data-slot="add-gutendex-load-more"]',
    ) as HTMLButtonElement
    expect(loadMore).not.toBeNull()
    await act(async () => {
      fireEvent.click(loadMore)
    })
    await waitFor(() => {
      expect(document.querySelectorAll('[data-slot="add-gutendex-row"]').length).toBe(2)
    })
    expect(mockedSearch).toHaveBeenCalledTimes(2)
    expect(mockedSearch.mock.calls[1]?.[0]?.cursor).toBe('cursor-2')
  })

  it('closes when closeAddBookDrawer fires (Esc/outside-click parity via store)', async () => {
    mockedSearch.mockResolvedValue(makeSearchResult([]))
    render(
      <Wrap client={makeClient()}>
        <AddGutendexSheet />
      </Wrap>,
    )
    act(() => {
      openAddBookDrawer()
    })
    await waitFor(() => {
      expect(document.querySelector('[data-slot="add-gutendex-sheet"]')).not.toBeNull()
    })
    act(() => {
      closeAddBookDrawer()
    })
    await waitFor(() => {
      expect(document.querySelector('[data-slot="add-gutendex-sheet"]')).toBeNull()
    })
  })
})
