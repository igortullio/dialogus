import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '../../../src/lib/api/_schemas'

vi.mock('../../../src/lib/api/library', () => ({
  fetchLibrary: vi.fn(),
  fetchIngestionStatus: vi.fn(),
  startIngestion: vi.fn(),
  retryIngestion: vi.fn(),
  removeBook: vi.fn(),
}))

vi.mock('../../../src/components/chat/add-book-drawer-store', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/components/chat/add-book-drawer-store')
  >('../../../src/components/chat/add-book-drawer-store')
  return {
    ...actual,
    openAddBookDrawer: vi.fn(),
  }
})

import { _internals, LIBRARY_QUERY_KEY, LibraryGrid } from '../../../src/app/library/LibraryGrid'
import { openAddBookDrawer } from '../../../src/components/chat/add-book-drawer-store'
import { fetchLibrary } from '../../../src/lib/api/library'

const mockedFetch = vi.mocked(fetchLibrary)
const mockedOpenDrawer = vi.mocked(openAddBookDrawer)

function makeBook(overrides: Partial<Book> & Pick<Book, 'id'>): Book {
  return {
    gutendex_id: 1,
    title: `Title-${overrides.id}`,
    authors: [{ name: `Author-${overrides.id}`, birth_year: null, death_year: null }],
    languages: ['en'],
    subjects: [],
    download_url_epub: null,
    download_url_txt: null,
    cover_url: null,
    raw_hash: null,
    ingestion_status: 'ready',
    ingestion_error: null,
    tags: [],
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60_000, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

function Wrap({
  children,
  client,
}: {
  readonly client: QueryClient
  readonly children: ReactNode
}) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  mockedFetch.mockReset()
  mockedOpenDrawer.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('LibraryGrid — copy and key contracts', () => {
  it('exports LIBRARY_QUERY_KEY = ["library"]', () => {
    expect(LIBRARY_QUERY_KEY).toEqual(['library'])
  })

  it('uses the responsive grid class chain (1/2/3/4 cols)', () => {
    expect(_internals.GRID_CLASSES).toContain('grid-cols-1')
    expect(_internals.GRID_CLASSES).toContain('sm:grid-cols-2')
    expect(_internals.GRID_CLASSES).toContain('lg:grid-cols-3')
    expect(_internals.GRID_CLASSES).toContain('xl:grid-cols-4')
  })
})

describe('filterBooks', () => {
  it('returns the input unchanged when query is empty', () => {
    const books = [makeBook({ id: 'a' }), makeBook({ id: 'b' })]
    expect(_internals.filterBooks(books, '')).toBe(books)
    expect(_internals.filterBooks(books, '   ')).toBe(books)
  })

  it('matches title substring case-insensitively', () => {
    const books = [
      makeBook({ id: 'm', title: 'Moby Dick' }),
      makeBook({ id: 'q', title: 'Quixote' }),
    ]
    const result = _internals.filterBooks(books, 'MOBY')
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('m')
  })

  it('matches author name substring', () => {
    const books = [
      makeBook({
        id: 'a',
        title: 'A',
        authors: [{ name: 'Melville', birth_year: null, death_year: null }],
      }),
      makeBook({
        id: 'b',
        title: 'B',
        authors: [{ name: 'Cervantes', birth_year: null, death_year: null }],
      }),
    ]
    const result = _internals.filterBooks(books, 'cerv')
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('b')
  })
})

describe('LibraryGrid — render states', () => {
  it('renders the empty state when the library has zero books', async () => {
    mockedFetch.mockResolvedValueOnce({ books: [], nextCursor: null })
    render(
      <Wrap client={makeClient()}>
        <LibraryGrid initialData={{ books: [], nextCursor: null }} />
      </Wrap>,
    )
    expect(document.querySelector('[data-slot="library-empty"]')).not.toBeNull()
    expect(screen.getByText(_internals.EMPTY_HEADING)).toBeDefined()
    expect(document.querySelector('[data-slot="library-grid"]')).toBeNull()
  })

  it('renders one BookCard per book (6 books → 6 cards)', () => {
    const books = Array.from({ length: 6 }, (_, i) => makeBook({ id: `b${i}` }))
    mockedFetch.mockResolvedValue({ books, nextCursor: null })
    render(
      <Wrap client={makeClient()}>
        <LibraryGrid initialData={{ books, nextCursor: null }} />
      </Wrap>,
    )
    const cards = document.querySelectorAll('[data-slot="book-card"]')
    expect(cards.length).toBe(6)
  })

  it('search input filters the rendered grid case-insensitively (title)', async () => {
    const books = [
      makeBook({ id: 'a', title: 'Moby Dick' }),
      makeBook({ id: 'b', title: 'Quixote' }),
      makeBook({ id: 'c', title: 'Brás Cubas' }),
    ]
    mockedFetch.mockResolvedValue({ books, nextCursor: null })
    render(
      <Wrap client={makeClient()}>
        <LibraryGrid initialData={{ books, nextCursor: null }} />
      </Wrap>,
    )
    expect(document.querySelectorAll('[data-slot="book-card"]').length).toBe(3)
    const input = document.querySelector('[data-slot="library-search-input"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'moby' } })
    })
    await waitFor(() => {
      expect(document.querySelectorAll('[data-slot="book-card"]').length).toBe(1)
    })
    const remaining = document.querySelector('[data-slot="book-card"]') as HTMLElement
    expect(remaining.getAttribute('data-book-id')).toBe('a')
    expect(remaining.querySelector('[data-slot="book-card-title"]')?.textContent).toBe('Moby Dick')
  })

  it('search with no matches renders the empty-filter state', async () => {
    const books = [makeBook({ id: 'a', title: 'Moby Dick' })]
    mockedFetch.mockResolvedValue({ books, nextCursor: null })
    render(
      <Wrap client={makeClient()}>
        <LibraryGrid initialData={{ books, nextCursor: null }} />
      </Wrap>,
    )
    const input = document.querySelector('[data-slot="library-search-input"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'zzzzzzz' } })
    })
    await waitFor(() => {
      expect(document.querySelector('[data-slot="library-empty-filter"]')).not.toBeNull()
    })
    expect(document.querySelector('[data-slot="library-grid"]')).toBeNull()
  })

  it('clicking the "Adicionar do Gutendex" button calls openAddBookDrawer', async () => {
    const books = [makeBook({ id: 'a' })]
    mockedFetch.mockResolvedValue({ books, nextCursor: null })
    render(
      <Wrap client={makeClient()}>
        <LibraryGrid initialData={{ books, nextCursor: null }} />
      </Wrap>,
    )
    const button = document.querySelector('[data-slot="library-add-button"]') as HTMLButtonElement
    fireEvent.click(button)
    expect(mockedOpenDrawer).toHaveBeenCalledTimes(1)
  })

  it('renders the error state when the library query rejects', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('boom'))
    render(
      <Wrap client={makeClient()}>
        <LibraryGrid />
      </Wrap>,
    )
    await waitFor(() => {
      expect(document.querySelector('[data-slot="library-error"]')).not.toBeNull()
    })
  })
})
