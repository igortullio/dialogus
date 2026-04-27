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

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import { toast } from 'sonner'
import { ThreadRow } from '../../../src/components/chat/ThreadRow'
import { THREADS_QUERY_KEY } from '../../../src/hooks/useThreadCleanup'
import type { Thread } from '../../../src/lib/api/_schemas'
import {
  deleteThread,
  fetchThreadMetadata,
  updateThreadMetadata,
} from '../../../src/lib/api/threads'

const mockedFetchMeta = vi.mocked(fetchThreadMetadata)
const mockedUpdateMeta = vi.mocked(updateThreadMetadata)
const mockedDelete = vi.mocked(deleteThread)
const mockedToastError = vi.mocked(toast.error)

const THREAD_ID = '11111111-1111-4111-8111-111111111111'

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: THREAD_ID,
    resourceId: 'user-1',
    title: 'Quem é o narrador de Brás Cubas?',
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

interface MountOpts {
  readonly thread?: Thread
  readonly metadata?: { custom_title: string | null; pinned: boolean }
  readonly onSelect?: (id: string) => void
  readonly isActive?: boolean
}

function mount(opts: MountOpts = {}) {
  const thread = opts.thread ?? makeThread()
  const metadata = opts.metadata ?? { custom_title: null, pinned: false }
  mockedFetchMeta.mockResolvedValue(metadata)
  const client = makeClient()
  client.setQueryData(THREADS_QUERY_KEY, [thread])
  const onSelect = opts.onSelect ?? vi.fn()
  const utils = render(
    <Wrap client={client}>
      <ThreadRow threadId={thread.id} isActive={opts.isActive ?? false} onSelect={onSelect} />
    </Wrap>,
  )
  return { ...utils, client, onSelect, thread, metadata }
}

beforeEach(() => {
  mockedFetchMeta.mockReset()
  mockedUpdateMeta.mockReset()
  mockedDelete.mockReset()
  mockedToastError.mockReset()
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

function openMenu(): void {
  const trigger = screen.getByRole('button', { name: 'Opções da conversa' })
  fireEvent.keyDown(trigger, { key: 'Enter' })
}

describe('ThreadRow — title rendering', () => {
  it('renders the Mastra default title (truncated to 40 chars) when no custom_title is set', async () => {
    mount({
      thread: makeThread({ title: 'Quem é o narrador de Memórias Póstumas de Brás Cubas?' }),
    })
    await waitFor(() => {
      expect(screen.getByText(/Quem é o narrador/)).toBeDefined()
    })
    const select = document.querySelector('[data-slot="thread-row-select"]') as HTMLElement | null
    expect(select?.textContent?.endsWith('…')).toBe(true)
  })

  it('renders the custom_title when set', async () => {
    mount({ metadata: { custom_title: 'Memórias deep dive', pinned: false } })
    await waitFor(() => {
      expect(screen.getByText('Memórias deep dive')).toBeDefined()
    })
  })

  it('falls back to a placeholder when both title and custom_title are missing', async () => {
    mount({
      thread: makeThread({ title: null }),
    })
    await waitFor(() => {
      expect(screen.getByText('Conversa sem título')).toBeDefined()
    })
  })
})

describe('ThreadRow — three-dot menu', () => {
  it('opens a menu with Renomear/Fixar/Excluir items', async () => {
    mount()
    openMenu()
    await waitFor(() => {
      expect(screen.getByText('Renomear')).toBeDefined()
    })
    expect(screen.getByText('Fixar')).toBeDefined()
    expect(screen.getByText('Excluir')).toBeDefined()
  })

  it('shows Desafixar instead of Fixar when the thread is already pinned', async () => {
    mount({ metadata: { custom_title: null, pinned: true } })
    await waitFor(() => {
      expect(document.querySelector('[data-slot="thread-row"]')).not.toBeNull()
    })
    openMenu()
    await waitFor(() => {
      expect(screen.getByText('Desafixar')).toBeDefined()
    })
  })
})

describe('ThreadRow — rename flow', () => {
  it('clicking "Renomear" reveals an inline input with the current title', async () => {
    mount({
      thread: makeThread({ title: 'Original' }),
    })
    await waitFor(() => screen.getByText('Original'))
    openMenu()
    await waitFor(() => screen.getByText('Renomear'))
    fireEvent.click(screen.getByText('Renomear'))
    await waitFor(() => {
      const input = document.querySelector(
        '[data-slot="thread-row-rename-input"]',
      ) as HTMLInputElement | null
      expect(input).not.toBeNull()
      expect(input?.value).toBe('Original')
    })
  })

  it('pressing Enter saves the new title via mutateRename', async () => {
    mockedUpdateMeta.mockResolvedValueOnce({
      custom_title: 'Memórias deep dive',
      pinned: false,
    })
    mount({
      thread: makeThread({ title: 'Original' }),
    })
    await waitFor(() => screen.getByText('Original'))
    openMenu()
    await waitFor(() => screen.getByText('Renomear'))
    fireEvent.click(screen.getByText('Renomear'))
    const input = (await waitFor(
      () => document.querySelector('[data-slot="thread-row-rename-input"]') as HTMLInputElement,
    )) as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Memórias deep dive' } })
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    await waitFor(() => {
      expect(mockedUpdateMeta).toHaveBeenCalledWith(THREAD_ID, {
        custom_title: 'Memórias deep dive',
      })
    })
  })

  it('Esc cancels rename without invoking mutateRename', async () => {
    mount()
    await waitFor(() => screen.getByText(/Quem é/))
    openMenu()
    await waitFor(() => screen.getByText('Renomear'))
    fireEvent.click(screen.getByText('Renomear'))
    const input = (await waitFor(
      () => document.querySelector('[data-slot="thread-row-rename-input"]') as HTMLInputElement,
    )) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'changed' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(mockedUpdateMeta).not.toHaveBeenCalled()
  })
})

describe('ThreadRow — pin', () => {
  it('clicking "Fixar" calls mutatePin(true)', async () => {
    mockedUpdateMeta.mockResolvedValueOnce({ custom_title: null, pinned: true })
    mount()
    await waitFor(() => document.querySelector('[data-slot="thread-row"]'))
    openMenu()
    await waitFor(() => screen.getByText('Fixar'))
    await act(async () => {
      fireEvent.click(screen.getByText('Fixar'))
    })
    await waitFor(() => {
      expect(mockedUpdateMeta).toHaveBeenCalledWith(THREAD_ID, { pinned: true })
    })
  })
})

describe('ThreadRow — delete flow', () => {
  it('confirming deletion calls deleteThread and clears localStorage spoiler caps for the thread', async () => {
    mockedDelete.mockResolvedValueOnce(undefined)
    window.localStorage.setItem(`dialogus:spoiler_cap:${THREAD_ID}:book-1`, '5')
    window.localStorage.setItem(`dialogus:spoiler_cap:${THREAD_ID}:book-2`, '10')
    window.localStorage.setItem('dialogus:spoiler_cap:other-thread:book-1', '7')
    mount()
    await waitFor(() => document.querySelector('[data-slot="thread-row"]'))
    openMenu()
    await waitFor(() => screen.getByText('Excluir'))
    fireEvent.click(screen.getByText('Excluir'))
    await waitFor(() => {
      expect(document.querySelector('[data-slot="thread-row-delete-dialog"]')).not.toBeNull()
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Excluir conversa'))
    })
    await waitFor(() => {
      expect(mockedDelete).toHaveBeenCalledWith(THREAD_ID)
    })
    expect(window.localStorage.getItem(`dialogus:spoiler_cap:${THREAD_ID}:book-1`)).toBeNull()
    expect(window.localStorage.getItem(`dialogus:spoiler_cap:${THREAD_ID}:book-2`)).toBeNull()
    expect(window.localStorage.getItem('dialogus:spoiler_cap:other-thread:book-1')).toBe('7')
  })

  it('on delete failure the row is restored in cache and a toast is surfaced', async () => {
    mockedDelete.mockRejectedValueOnce(new Error('boom'))
    const client = makeClient()
    const original = [makeThread()]
    client.setQueryData(THREADS_QUERY_KEY, original)
    mockedFetchMeta.mockResolvedValue({ custom_title: null, pinned: false })
    render(
      <Wrap client={client}>
        <ThreadRow threadId={THREAD_ID} isActive={false} onSelect={() => {}} />
      </Wrap>,
    )
    await waitFor(() => document.querySelector('[data-slot="thread-row"]'))
    openMenu()
    await waitFor(() => screen.getByText('Excluir'))
    fireEvent.click(screen.getByText('Excluir'))
    await waitFor(() => document.querySelector('[data-slot="thread-row-delete-dialog"]'))
    await act(async () => {
      fireEvent.click(screen.getByText('Excluir conversa'))
    })
    await waitFor(() => {
      expect(mockedToastError).toHaveBeenCalled()
    })
    const restored = client.getQueryData(THREADS_QUERY_KEY) as Thread[] | undefined
    expect(restored?.find((thread) => thread.id === THREAD_ID)).toBeDefined()
  })
})

describe('ThreadRow — selection', () => {
  it('clicking the row body calls onSelect(threadId)', async () => {
    const onSelect = vi.fn()
    mount({ onSelect })
    await waitFor(() => document.querySelector('[data-slot="thread-row-select"]'))
    fireEvent.click(document.querySelector('[data-slot="thread-row-select"]') as HTMLButtonElement)
    expect(onSelect).toHaveBeenCalledWith(THREAD_ID)
  })
})
