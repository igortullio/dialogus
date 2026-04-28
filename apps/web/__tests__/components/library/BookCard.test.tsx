import type { IngestionStatusDto } from '@dialogus/shared/schemas/ingestion'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '../../../src/lib/api/_schemas'

vi.mock('../../../src/lib/api/library', () => ({
  startIngestion: vi.fn(),
  retryIngestion: vi.fn(),
  removeBook: vi.fn(),
  fetchIngestionStatus: vi.fn(),
}))

import { BookCard } from '../../../src/components/library/BookCard'
import {
  fetchIngestionStatus,
  removeBook,
  retryIngestion,
  startIngestion,
} from '../../../src/lib/api/library'

const mockedStart = vi.mocked(startIngestion)
const mockedRetry = vi.mocked(retryIngestion)
const mockedRemove = vi.mocked(removeBook)
const mockedStatus = vi.mocked(fetchIngestionStatus)

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

function makeStatus(
  overrides: Partial<IngestionStatusDto> & Pick<IngestionStatusDto, 'book_id' | 'status'>,
): IngestionStatusDto {
  return {
    stage: null,
    progress: 0,
    started_at: null,
    indexed_at: null,
    last_stage: null,
    error: null,
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
  mockedStart.mockReset()
  mockedRetry.mockReset()
  mockedRemove.mockReset()
  mockedStatus.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BookCard', () => {
  it('renders title, authors and language flag', () => {
    const book = makeBook({ title: 'Memórias Póstumas', languages: ['pt'] })
    render(
      <Wrap client={makeClient()}>
        <BookCard book={book} />
      </Wrap>,
    )
    expect(screen.getByText('Memórias Póstumas')).toBeDefined()
    expect(screen.getByText('Alexandre Dumas')).toBeDefined()
    const lang = document.querySelector('[data-slot="book-card-language"]') as HTMLElement
    expect(lang.textContent).toContain('🇧🇷')
    expect(lang.textContent?.toLowerCase()).toContain('pt')
  })

  it('shows the cover fallback when cover_url is null', () => {
    render(
      <Wrap client={makeClient()}>
        <BookCard book={makeBook({ cover_url: null })} />
      </Wrap>,
    )
    expect(document.querySelector('[data-slot="book-card-cover-fallback"]')).not.toBeNull()
    expect(document.querySelector('[data-slot="book-card-cover"]')).toBeNull()
  })

  it('renders the cover image when cover_url is present', () => {
    render(
      <Wrap client={makeClient()}>
        <BookCard book={makeBook({ cover_url: 'https://example.org/cover.jpg' })} />
      </Wrap>,
    )
    const img = document.querySelector('[data-slot="book-card-cover"]') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.getAttribute('src')).toBe('https://example.org/cover.jpg')
  })

  it('discovered: clicking "Ingerir" calls startIngestion with the book id', async () => {
    const book = makeBook({ ingestion_status: 'discovered' })
    mockedStart.mockResolvedValueOnce({ jobId: 'job-1' })
    render(
      <Wrap client={makeClient()}>
        <BookCard book={book} />
      </Wrap>,
    )
    const button = document.querySelector(
      '[data-slot="book-card-action-ingest"]',
    ) as HTMLButtonElement
    expect(button).not.toBeNull()
    await act(async () => {
      fireEvent.click(button)
    })
    await waitFor(() => {
      expect(mockedStart).toHaveBeenCalledTimes(1)
    })
    expect(mockedStart.mock.calls[0]?.[0]).toBe(book.id)
    expect(mockedStart.mock.calls[0]?.[1]).toEqual(expect.any(String))
  })

  it('ready: shows Detalhes + Remover buttons; Detalhes opens the dialog', async () => {
    const book = makeBook({ ingestion_status: 'ready' })
    render(
      <Wrap client={makeClient()}>
        <BookCard book={book} />
      </Wrap>,
    )
    const details = document.querySelector(
      '[data-slot="book-card-action-details"]',
    ) as HTMLButtonElement
    const remove = document.querySelector(
      '[data-slot="book-card-action-remove"]',
    ) as HTMLButtonElement
    expect(details).not.toBeNull()
    expect(remove).not.toBeNull()
    await act(async () => {
      fireEvent.click(details)
    })
    await waitFor(() => {
      expect(document.querySelector('[data-slot="book-details-dialog"]')).not.toBeNull()
    })
  })

  it('ready: clicking Remover triggers removeBook mutation', async () => {
    const book = makeBook({ ingestion_status: 'ready' })
    mockedRemove.mockResolvedValueOnce(undefined)
    render(
      <Wrap client={makeClient()}>
        <BookCard book={book} />
      </Wrap>,
    )
    const remove = document.querySelector(
      '[data-slot="book-card-action-remove"]',
    ) as HTMLButtonElement
    await act(async () => {
      fireEvent.click(remove)
    })
    await waitFor(() => {
      expect(mockedRemove).toHaveBeenCalledWith(book.id)
    })
  })

  it('failed: shows error text + "Tentar novamente" which retries ingestion', async () => {
    const book = makeBook({
      ingestion_status: 'failed',
      ingestion_error: 'Falha ao baixar conteúdo do Gutendex.',
    })
    mockedRetry.mockResolvedValueOnce({ jobId: 'job-r', resumingStage: 'download' })
    render(
      <Wrap client={makeClient()}>
        <BookCard book={book} />
      </Wrap>,
    )
    expect(screen.getByText('Falha ao baixar conteúdo do Gutendex.')).toBeDefined()
    const retry = document.querySelector(
      '[data-slot="book-card-action-retry"]',
    ) as HTMLButtonElement
    await act(async () => {
      fireEvent.click(retry)
    })
    await waitFor(() => {
      expect(mockedRetry).toHaveBeenCalledTimes(1)
    })
    expect(mockedRetry.mock.calls[0]?.[0]).toBe(book.id)
  })

  it('in-progress: renders the progress bar and no actions', async () => {
    const book = makeBook({ ingestion_status: 'embedding' })
    mockedStatus.mockResolvedValueOnce(
      makeStatus({
        book_id: book.id,
        status: 'embedding',
        stage: 'embed',
        progress: 65,
      }),
    )
    render(
      <Wrap client={makeClient()}>
        <BookCard book={book} />
      </Wrap>,
    )
    await waitFor(() => {
      const bar = document.querySelector('[data-slot="book-card-progress-bar"]')
      expect(bar?.getAttribute('aria-valuenow')).toBe('65')
    })
    expect(document.querySelector('[data-slot="book-card-action-ingest"]')).toBeNull()
    expect(document.querySelector('[data-slot="book-card-action-remove"]')).toBeNull()
    expect(document.querySelector('[data-slot="book-card-action-retry"]')).toBeNull()
    expect(mockedStatus).toHaveBeenCalledWith(book.id)
  })

  it('does not poll for terminal-state books (ready)', () => {
    render(
      <Wrap client={makeClient()}>
        <BookCard book={makeBook({ ingestion_status: 'ready' })} />
      </Wrap>,
    )
    expect(mockedStatus).not.toHaveBeenCalled()
  })

  it('does not poll for discovered books', () => {
    render(
      <Wrap client={makeClient()}>
        <BookCard book={makeBook({ ingestion_status: 'discovered' })} />
      </Wrap>,
    )
    expect(mockedStatus).not.toHaveBeenCalled()
  })
})
