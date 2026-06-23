import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/api/threads', () => ({
  deleteThread: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import { toast } from 'sonner'
import { THREADS_QUERY_KEY, useThreadCleanup } from '../../src/hooks/useThreadCleanup'
import type { Thread } from '../../src/lib/api/_schemas'
import { deleteThread } from '../../src/lib/api/threads'
import { BOOK_PREFERENCE_QUERY_KEY } from '../../src/lib/query-keys'

const mockedDelete = vi.mocked(deleteThread)
const mockedToastError = vi.mocked(toast.error)
const THREAD_ID = '11111111-1111-4111-8111-111111111111'

function makeThread(id: string): Thread {
  return {
    id,
    resourceId: 'user-1',
    title: `Thread ${id}`,
    createdAt: '2026-04-20T00:00:00Z',
    updatedAt: '2026-04-20T00:00:00Z',
    metadata: { custom_title: null, pinned: false },
  }
}

function makeWrapper(client: QueryClient): (props: { children: ReactNode }) => ReactElement {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  mockedDelete.mockReset()
  mockedToastError.mockReset()
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('useThreadCleanup', () => {
  it('optimistically removes the thread without touching account-scoped book caps', async () => {
    let resolveDelete!: () => void
    mockedDelete.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveDelete = resolve
      }),
    )

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 60_000, staleTime: 0 },
        mutations: { retry: false },
      },
    })
    client.setQueryData(THREADS_QUERY_KEY, [makeThread(THREAD_ID), makeThread('other')])
    // Spoiler caps are per-book and account-scoped; deleting a thread must leave
    // them intact (they are shared across the user's other threads).
    client.setQueryData(BOOK_PREFERENCE_QUERY_KEY('b1'), 5)

    const { result } = renderHook(() => useThreadCleanup(THREAD_ID), {
      wrapper: makeWrapper(client),
    })

    await act(async () => {
      void result.current.delete()
      await Promise.resolve()
    })

    const optimistic = client.getQueryData(THREADS_QUERY_KEY) as Thread[]
    expect(optimistic.find((t) => t.id === THREAD_ID)).toBeUndefined()
    // The book cap survives the thread deletion.
    expect(client.getQueryData(BOOK_PREFERENCE_QUERY_KEY('b1'))).toBe(5)

    await act(async () => {
      resolveDelete()
      await Promise.resolve()
    })
  })

  it('rolls back the cache and surfaces a toast on API error', async () => {
    mockedDelete.mockRejectedValueOnce(new Error('boom'))

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 60_000, staleTime: 0 },
        mutations: { retry: false },
      },
    })
    const original = [makeThread(THREAD_ID), makeThread('other')]
    client.setQueryData(THREADS_QUERY_KEY, original)

    const { result } = renderHook(() => useThreadCleanup(THREAD_ID), {
      wrapper: makeWrapper(client),
    })

    await act(async () => {
      await result.current.delete()
    })

    await waitFor(() => {
      expect(mockedToastError).toHaveBeenCalled()
    })
    const restored = client.getQueryData(THREADS_QUERY_KEY) as Thread[]
    expect(restored.find((t) => t.id === THREAD_ID)).toBeDefined()
  })
})
