import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/lib/api/library', () => ({
  removeBook: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import { RemoveBookDialog } from '../../../src/components/library/RemoveBookDialog'
import type { Book } from '../../../src/lib/api/_schemas'
import { removeBook } from '../../../src/lib/api/library'

const mockedRemove = vi.mocked(removeBook)

import { toast } from 'sonner'

const mockedToastError = vi.mocked(toast.error)

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
  client,
  children,
}: {
  readonly client: QueryClient
  readonly children: ReactNode
}) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  mockedRemove.mockReset()
  mockedToastError.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('RemoveBookDialog', () => {
  it('renders the trigger button without opening the dialog', () => {
    render(
      <Wrap client={makeClient()}>
        <RemoveBookDialog book={makeBook()} />
      </Wrap>,
    )
    expect(document.querySelector('[data-slot="book-card-action-remove"]')).not.toBeNull()
    expect(document.querySelector('[data-slot="remove-book-dialog"]')).toBeNull()
  })

  it('clicking the trigger opens the dialog with the book title in the description', async () => {
    const book = makeBook({ title: 'Memórias Póstumas' })
    render(
      <Wrap client={makeClient()}>
        <RemoveBookDialog book={book} />
      </Wrap>,
    )
    const trigger = document.querySelector(
      '[data-slot="book-card-action-remove"]',
    ) as HTMLButtonElement
    await act(async () => {
      fireEvent.click(trigger)
    })
    await waitFor(() => {
      expect(document.querySelector('[data-slot="remove-book-dialog"]')).not.toBeNull()
    })
    const description = document.querySelector('[data-slot="remove-book-dialog-description"]')
    expect(description?.textContent).toContain('Memórias Póstumas')
  })

  it('confirm calls removeBook and invalidates ["library"]', async () => {
    const client = makeClient()
    const book = makeBook()
    mockedRemove.mockResolvedValueOnce(undefined)
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    render(
      <Wrap client={client}>
        <RemoveBookDialog book={book} />
      </Wrap>,
    )
    await act(async () => {
      fireEvent.click(
        document.querySelector('[data-slot="book-card-action-remove"]') as HTMLButtonElement,
      )
    })
    const confirm = await waitFor(() => {
      const node = document.querySelector(
        '[data-slot="remove-book-dialog-confirm"]',
      ) as HTMLButtonElement | null
      if (!node) throw new Error('confirm not found')
      return node
    })
    await act(async () => {
      fireEvent.click(confirm)
    })
    await waitFor(() => {
      expect(mockedRemove).toHaveBeenCalledWith(book.id)
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['library'] })
  })

  it('cancel does not call removeBook', async () => {
    render(
      <Wrap client={makeClient()}>
        <RemoveBookDialog book={makeBook()} />
      </Wrap>,
    )
    await act(async () => {
      fireEvent.click(
        document.querySelector('[data-slot="book-card-action-remove"]') as HTMLButtonElement,
      )
    })
    const cancel = await waitFor(() => {
      const node = document.querySelector(
        '[data-slot="remove-book-dialog-cancel"]',
      ) as HTMLButtonElement | null
      if (!node) throw new Error('cancel not found')
      return node
    })
    await act(async () => {
      fireEvent.click(cancel)
    })
    expect(mockedRemove).not.toHaveBeenCalled()
  })

  it('on error: shows a toast and keeps the dialog open', async () => {
    mockedRemove.mockRejectedValueOnce(new Error('boom'))
    render(
      <Wrap client={makeClient()}>
        <RemoveBookDialog book={makeBook()} />
      </Wrap>,
    )
    await act(async () => {
      fireEvent.click(
        document.querySelector('[data-slot="book-card-action-remove"]') as HTMLButtonElement,
      )
    })
    const confirm = await waitFor(() => {
      const node = document.querySelector(
        '[data-slot="remove-book-dialog-confirm"]',
      ) as HTMLButtonElement | null
      if (!node) throw new Error('confirm not found')
      return node
    })
    await act(async () => {
      fireEvent.click(confirm)
    })
    await waitFor(() => {
      expect(mockedToastError).toHaveBeenCalled()
    })
    expect(document.querySelector('[data-slot="remove-book-dialog"]')).not.toBeNull()
  })
})

void screen
