import type { IngestionStatusDto } from '@dialogus/shared/schemas/ingestion'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '../../../src/lib/api/_schemas'

vi.mock('../../../src/lib/api/library', () => ({
  addBook: vi.fn(),
  startIngestion: vi.fn(),
  fetchIngestionStatus: vi.fn(),
}))

import { EmptyStateCard } from '../../../src/components/chat/EmptyStateCard'
import { addBook, fetchIngestionStatus, startIngestion } from '../../../src/lib/api/library'

const mockedAdd = vi.mocked(addBook)
const mockedStart = vi.mocked(startIngestion)
const mockedStatus = vi.mocked(fetchIngestionStatus)

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    gutendex_id: 1,
    title: 'Test Book',
    authors: [{ name: 'Author', birth_year: null, death_year: null }],
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
      queries: { retry: false, gcTime: 0, staleTime: 0 },
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
  mockedAdd.mockReset()
  mockedStart.mockReset()
  mockedStatus.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('EmptyStateCard', () => {
  it('renders three onboarding cards with the configured Gutendex titles', () => {
    const client = makeClient()
    render(
      <Wrap client={client}>
        <EmptyStateCard />
      </Wrap>,
    )
    expect(screen.getByText('The Count of Monte Cristo')).toBeDefined()
    expect(screen.getByText('Memórias Póstumas de Brás Cubas')).toBeDefined()
    expect(screen.getByText('Crime and Punishment')).toBeDefined()
    const cards = document.querySelectorAll('[data-slot="onboarding-book-card"]')
    expect(cards.length).toBe(3)
  })

  it('clicking "Adicionar e ingerir" on Brás Cubas calls addBook with gutendex_id 54829', async () => {
    const book = makeBook({ id: 'book-bras', gutendex_id: 54829 })
    let resolveAdd!: (value: Book) => void
    mockedAdd.mockReturnValueOnce(
      new Promise<Book>((resolve) => {
        resolveAdd = resolve
      }),
    )
    mockedStart.mockResolvedValueOnce({ jobId: 'job-1' })
    mockedStatus.mockResolvedValue(
      makeStatus({ book_id: book.id, status: 'downloading', stage: 'download', progress: 10 }),
    )

    const client = makeClient()
    render(
      <Wrap client={client}>
        <EmptyStateCard />
      </Wrap>,
    )
    const brasCard = document.querySelector(
      '[data-slot="onboarding-book-card"][data-gutendex-id="54829"]',
    ) as HTMLElement | null
    expect(brasCard).not.toBeNull()
    const addButton = brasCard?.querySelector(
      '[data-slot="onboarding-add-button"]',
    ) as HTMLButtonElement | null
    expect(addButton).not.toBeNull()
    await act(async () => {
      fireEvent.click(addButton as HTMLButtonElement)
    })
    expect(mockedAdd).toHaveBeenCalledWith(54829, expect.any(String))

    await act(async () => {
      resolveAdd(book)
      await Promise.resolve()
    })
  })

  it('after a successful add, the card shows ingestion progress', async () => {
    const book = makeBook({ id: 'book-bras', gutendex_id: 54829 })
    mockedAdd.mockResolvedValueOnce(book)
    mockedStart.mockResolvedValueOnce({ jobId: 'job-1' })
    mockedStatus.mockResolvedValue(
      makeStatus({ book_id: book.id, status: 'embedding', stage: 'embed', progress: 65 }),
    )

    const client = makeClient()
    render(
      <Wrap client={client}>
        <EmptyStateCard />
      </Wrap>,
    )
    const brasCard = document.querySelector(
      '[data-slot="onboarding-book-card"][data-gutendex-id="54829"]',
    ) as HTMLElement
    const addButton = brasCard.querySelector(
      '[data-slot="onboarding-add-button"]',
    ) as HTMLButtonElement
    await act(async () => {
      fireEvent.click(addButton)
    })
    await waitFor(() => {
      expect(brasCard.getAttribute('data-phase')).toBe('ingesting')
    })
    await waitFor(() => {
      expect(brasCard.querySelector('[data-slot="onboarding-progress"]')).not.toBeNull()
    })
  })

  it('collapses to a "Pronto!" message + compose link once all three books reach ready', async () => {
    const ids = [
      { gutendex: 1184, bookId: 'book-monte' },
      { gutendex: 54829, bookId: 'book-bras' },
      { gutendex: 2554, bookId: 'book-crime' },
    ]
    for (const it of ids) {
      mockedAdd.mockImplementationOnce(async () =>
        makeBook({ id: it.bookId, gutendex_id: it.gutendex }),
      )
      mockedStart.mockImplementationOnce(async () => ({ jobId: 'job' }))
    }
    mockedStatus.mockImplementation(async (id: string) =>
      makeStatus({ book_id: id, status: 'ready', stage: null, progress: 100 }),
    )

    const client = makeClient()
    render(
      <Wrap client={client}>
        <EmptyStateCard />
      </Wrap>,
    )

    for (const _ of ids) {
      const button = document.querySelector(
        '[data-slot="onboarding-add-button"]',
      ) as HTMLButtonElement | null
      // The first un-clicked card is always the first remaining add-button
      expect(button).not.toBeNull()
      await act(async () => {
        ;(button as HTMLButtonElement).click()
        await Promise.resolve()
      })
      await waitFor(() => {
        const remaining = document.querySelectorAll(
          '[data-phase="ingesting"], [data-phase="adding"]',
        )
        expect(remaining.length === 0).toBe(true)
      })
    }

    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="empty-state-card"][data-state="all-ready"]'),
      ).not.toBeNull()
    })
    expect(screen.getByText('Pronto!')).toBeDefined()
    const composeLink = document.querySelector(
      '[data-slot="empty-state-compose-link"]',
    ) as HTMLAnchorElement | null
    expect(composeLink?.getAttribute('href')).toBe('/')
  })
})
