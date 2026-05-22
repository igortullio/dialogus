import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/lib/api/threads', () => ({
  listThreads: vi.fn(),
  fetchThreadMetadata: vi.fn(),
  updateThreadMetadata: vi.fn(),
  deleteThread: vi.fn(),
}))

vi.mock('../../../src/lib/api/library', () => ({
  fetchLibrary: vi.fn().mockResolvedValue({ books: [], nextCursor: null }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import { ThreadSidebar } from '../../../src/components/chat/ThreadSidebar'
import type { Thread } from '../../../src/lib/api/_schemas'
import { fetchThreadMetadata, listThreads } from '../../../src/lib/api/threads'

const mockedList = vi.mocked(listThreads)
const mockedFetchMeta = vi.mocked(fetchThreadMetadata)

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
  mockedList.mockReset()
  mockedFetchMeta.mockReset()
  mockedFetchMeta.mockResolvedValue({ custom_title: null, pinned: false })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ThreadSidebar', () => {
  it('renders the EmptyStateCard when no threads exist', async () => {
    mockedList.mockResolvedValueOnce([])
    const client = makeClient()
    render(
      <Wrap client={client}>
        <ThreadSidebar selectedThreadId={null} onSelectThread={() => {}} />
      </Wrap>,
    )
    await waitFor(() => {
      expect(screen.getByText('Acervo vazio')).toBeDefined()
    })
    expect(document.querySelector('[data-slot="empty-state-card"]')).not.toBeNull()
    const link = document.querySelector('[data-slot="empty-state-library-link"]')
    expect(link?.getAttribute('href')).toBe('/library')
    expect(document.querySelector('[data-slot="thread-sidebar-pinned"]')).toBeNull()
    expect(document.querySelector('[data-slot="thread-sidebar-recent"]')).toBeNull()
  })

  it('renders Fixadas group with pinned threads and Recentes group with the rest', async () => {
    const threads: Thread[] = [
      makeThread({
        id: 't-pinned-1',
        title: 'Pinned A',
        updatedAt: '2026-04-22T00:00:00Z',
        metadata: { custom_title: null, pinned: true },
      }),
      makeThread({
        id: 't-pinned-2',
        title: 'Pinned B',
        updatedAt: '2026-04-23T00:00:00Z',
        metadata: { custom_title: null, pinned: true },
      }),
      makeThread({
        id: 't-recent-1',
        title: 'Recent A',
        updatedAt: '2026-04-21T00:00:00Z',
      }),
      makeThread({
        id: 't-recent-2',
        title: 'Recent B',
        updatedAt: '2026-04-25T00:00:00Z',
      }),
      makeThread({
        id: 't-recent-3',
        title: 'Recent C',
        updatedAt: '2026-04-19T00:00:00Z',
      }),
    ]
    mockedList.mockResolvedValueOnce(threads)
    const client = makeClient()
    render(
      <Wrap client={client}>
        <ThreadSidebar selectedThreadId={null} onSelectThread={() => {}} />
      </Wrap>,
    )
    await waitFor(() => {
      expect(screen.getByText('Fixadas')).toBeDefined()
    })
    const pinned = document.querySelector('[data-slot="thread-sidebar-pinned"]')
    const recent = document.querySelector('[data-slot="thread-sidebar-recent"]')
    expect(pinned).not.toBeNull()
    expect(recent).not.toBeNull()
    const pinnedRows = pinned?.querySelectorAll('[data-slot="thread-row"]') ?? []
    const recentRows = recent?.querySelectorAll('[data-slot="thread-row"]') ?? []
    expect(pinnedRows.length).toBe(2)
    expect(recentRows.length).toBe(3)
    expect(pinnedRows[0]?.getAttribute('data-thread-id')).toBe('t-pinned-2')
    expect(pinnedRows[1]?.getAttribute('data-thread-id')).toBe('t-pinned-1')
  })

  it('hides the Recentes group entirely when every thread is pinned', async () => {
    const threads: Thread[] = [
      makeThread({
        id: 't-pinned-1',
        metadata: { custom_title: null, pinned: true },
      }),
      makeThread({
        id: 't-pinned-2',
        metadata: { custom_title: null, pinned: true },
      }),
    ]
    mockedList.mockResolvedValueOnce(threads)
    const client = makeClient()
    render(
      <Wrap client={client}>
        <ThreadSidebar selectedThreadId={null} onSelectThread={() => {}} />
      </Wrap>,
    )
    await waitFor(() => {
      expect(screen.getByText('Fixadas')).toBeDefined()
    })
    expect(document.querySelector('[data-slot="thread-sidebar-recent"]')).toBeNull()
    expect(screen.queryByText('Recentes')).toBeNull()
  })

  it('clicking "Nova conversa" calls onSelectThread(null)', async () => {
    mockedList.mockResolvedValueOnce([makeThread({ id: 't-1', updatedAt: '2026-04-20T00:00:00Z' })])
    const onSelect = vi.fn()
    const client = makeClient()
    render(
      <Wrap client={client}>
        <ThreadSidebar selectedThreadId="t-1" onSelectThread={onSelect} />
      </Wrap>,
    )
    await waitFor(() => screen.getByText('Nova conversa'))
    fireEvent.click(screen.getByText('Nova conversa'))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('renders a "Gerenciar acervo" link in the footer pointing at /library', async () => {
    mockedList.mockResolvedValueOnce([])
    const client = makeClient()
    render(
      <Wrap client={client}>
        <ThreadSidebar selectedThreadId={null} onSelectThread={() => {}} />
      </Wrap>,
    )
    await waitFor(() => screen.getByText('Gerenciar acervo'))
    const link = screen.getByText('Gerenciar acervo').closest('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('/library')
  })

  it('shows an error message when listThreads rejects', async () => {
    mockedList.mockRejectedValueOnce(new Error('boom'))
    const client = makeClient()
    render(
      <Wrap client={client}>
        <ThreadSidebar selectedThreadId={null} onSelectThread={() => {}} />
      </Wrap>,
    )
    await waitFor(() => {
      expect(document.querySelector('[data-slot="thread-sidebar-error"]')).not.toBeNull()
    })
  })
})
