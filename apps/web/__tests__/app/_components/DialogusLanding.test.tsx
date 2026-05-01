import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/lib/api/threads', () => ({
  listThreads: vi.fn(),
  fetchThreadMetadata: vi.fn(),
  updateThreadMetadata: vi.fn(),
  deleteThread: vi.fn(),
}))

vi.mock('../../../src/lib/api/library', () => ({
  fetchBookById: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import { DialogusLanding } from '../../../src/app/_components/DialogusLanding'
import {
  _resetCitationPanelForTests,
  openCitationPanel,
} from '../../../src/components/citation/citation-panel-state'
import type { Thread } from '../../../src/lib/api/_schemas'
import { fetchBookById } from '../../../src/lib/api/library'
import { fetchThreadMetadata, listThreads } from '../../../src/lib/api/threads'

const mockedList = vi.mocked(listThreads)
const mockedFetchMeta = vi.mocked(fetchThreadMetadata)
const mockedFetchBook = vi.mocked(fetchBookById)

function makeThread(overrides: Partial<Thread> & Pick<Thread, 'id'>): Thread {
  return {
    resourceId: 'user-1',
    title: `Thread ${overrides.id}`,
    createdAt: '2026-04-20T00:00:00Z',
    updatedAt: '2026-04-20T00:00:00Z',
    metadata: { custom_title: null, pinned: false },
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

function Wrap({ children, client }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  mockedList.mockReset()
  mockedFetchMeta.mockReset()
  mockedFetchBook.mockReset()
  mockedFetchMeta.mockResolvedValue({ custom_title: null, pinned: false })
  mockedFetchBook.mockResolvedValue({
    id: '11111111-1111-4111-8111-111111111111',
    gutendex_id: 1,
    title: 'Brás Cubas',
    authors: [{ name: 'Machado de Assis', birth_year: 1839, death_year: 1908 }],
    languages: ['pt'],
    subjects: [],
    download_url_epub: null,
    download_url_txt: null,
    cover_url: null,
    raw_hash: null,
    ingestion_status: 'ready',
    ingestion_error: null,
    tags: [],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    deleted_at: null,
    chapter_count: 50,
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      return new Response(JSON.stringify({ data: [], links: { next: null } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
  _resetCitationPanelForTests()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('DialogusLanding (chat-first landing)', () => {
  it('renders the sidebar and the empty main state when no thread is active', async () => {
    mockedList.mockResolvedValueOnce([makeThread({ id: 't-1', title: 'Brás Cubas deep dive' })])
    render(
      <Wrap client={makeClient()}>
        <DialogusLanding />
      </Wrap>,
    )

    await waitFor(() => {
      expect(document.querySelector('[data-slot="dialogus-landing"]')).not.toBeNull()
    })
    // Desktop sidebar rendered (CSS-hidden on small screens but in DOM)
    expect(document.querySelector('[data-slot="dialogus-desktop-sidebar"]')).not.toBeNull()
    // Empty main copy is visible — ThreadPrimitive.If renders reactively so wrap in waitFor
    await waitFor(() => {
      expect(screen.getByText('Selecione uma conversa ou comece uma nova')).toBeDefined()
      expect(document.querySelector('[data-slot="empty-chat-main"]')).not.toBeNull()
    })
    // Composer is mounted (BookPicker active because no existing thread)
    expect(document.querySelector('[data-slot="dialogus-composer"]')).not.toBeNull()
  })

  it('renders a hamburger trigger that opens the mobile sidebar drawer', async () => {
    mockedList.mockResolvedValueOnce([])
    render(
      <Wrap client={makeClient()}>
        <DialogusLanding />
      </Wrap>,
    )

    const trigger = await waitFor(() => {
      const el = document.querySelector('[data-slot="dialogus-mobile-trigger"]')
      if (!el) throw new Error('hamburger not yet mounted')
      return el as HTMLElement
    })
    expect(trigger.getAttribute('aria-label')).toBe('Abrir conversas')
    // Drawer not open initially
    expect(document.querySelector('[data-slot="dialogus-mobile-sidebar"]')).toBeNull()

    act(() => {
      fireEvent.click(trigger)
    })

    await waitFor(() => {
      expect(document.querySelector('[data-slot="dialogus-mobile-sidebar"]')).not.toBeNull()
    })
  })

  it('switches the active thread when a sidebar row is selected', async () => {
    mockedList.mockResolvedValueOnce([
      makeThread({ id: 't-aaa', title: 'Thread A' }),
      makeThread({ id: 't-bbb', title: 'Thread B' }),
    ])
    render(
      <Wrap client={makeClient()}>
        <DialogusLanding />
      </Wrap>,
    )

    const rowA = await waitFor(() => {
      const el = document
        .querySelector('[data-thread-id="t-aaa"]')
        ?.querySelector('[data-slot="thread-row-select"]')
      if (!el) throw new Error('thread row A not yet mounted')
      return el as HTMLElement
    })

    expect(document.querySelector('[data-slot="empty-chat-main"]')).not.toBeNull()

    act(() => {
      fireEvent.click(rowA)
    })

    await waitFor(() => {
      // Empty state disappears once a thread is active
      expect(document.querySelector('[data-slot="empty-chat-main"]')).toBeNull()
    })
  })

  it('clicking "Nova conversa" clears the active thread back to the empty composer state', async () => {
    mockedList.mockResolvedValueOnce([makeThread({ id: 't-aaa', title: 'Thread A' })])
    render(
      <Wrap client={makeClient()}>
        <DialogusLanding />
      </Wrap>,
    )

    const rowA = await waitFor(() => {
      const el = document
        .querySelector('[data-thread-id="t-aaa"]')
        ?.querySelector('[data-slot="thread-row-select"]')
      if (!el) throw new Error('thread row not yet mounted')
      return el as HTMLElement
    })
    act(() => {
      fireEvent.click(rowA)
    })
    await waitFor(() => {
      expect(document.querySelector('[data-slot="empty-chat-main"]')).toBeNull()
    })

    const newButtons = screen.getAllByText('Nova conversa')
    expect(newButtons.length).toBeGreaterThan(0)
    act(() => {
      fireEvent.click(newButtons[0] as HTMLElement)
    })

    await waitFor(() => {
      expect(document.querySelector('[data-slot="empty-chat-main"]')).not.toBeNull()
    })
    // Composer is still mounted; BookPicker is active because isExistingThread === false
    expect(document.querySelector('[data-slot="dialogus-composer"]')).not.toBeNull()
  })

  it('mounts <CitationSidePanel /> once at the page level and reflects panel state', async () => {
    mockedList.mockResolvedValueOnce([])
    render(
      <Wrap client={makeClient()}>
        <DialogusLanding />
      </Wrap>,
    )

    await waitFor(() => {
      expect(document.querySelector('[data-slot="dialogus-landing"]')).not.toBeNull()
    })
    // No panel mounted yet
    expect(document.querySelector('[data-slot="citation-side-panel"]')).toBeNull()

    act(() => {
      openCitationPanel('22222222-2222-4222-8222-222222222222')
    })

    await waitFor(() => {
      const panels = document.querySelectorAll('[data-slot="citation-side-panel"]')
      expect(panels.length).toBe(1)
    })
  })
})
