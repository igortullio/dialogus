import type { ThreadMetadata } from '@dialogus/shared/schemas/thread'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/api/threads', () => ({
  fetchThreadMetadata: vi.fn(),
  updateThreadMetadata: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import { toast } from 'sonner'
import { fetchThreadMetadata, updateThreadMetadata } from '../../src/lib/api/threads'
import { threadMetadataQueryKey, useThreadMetadata } from '../../src/lib/thread-metadata'

const mockedFetch = vi.mocked(fetchThreadMetadata)
const mockedUpdate = vi.mocked(updateThreadMetadata)
const mockedToastError = vi.mocked(toast.error)

function makeWrapper(): {
  Wrapper: ({ children }: { children: ReactNode }) => ReactElement
  client: QueryClient
} {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return { Wrapper, client }
}

beforeEach(() => {
  mockedFetch.mockReset()
  mockedUpdate.mockReset()
  mockedToastError.mockReset()
})

afterEach(() => {
  vi.clearAllTimers()
})

describe('useThreadMetadata — initial render', () => {
  it('returns isLoading:true with default data on first render', () => {
    let resolveFetch!: (value: ThreadMetadata) => void
    mockedFetch.mockReturnValueOnce(
      new Promise<ThreadMetadata>((resolve) => {
        resolveFetch = resolve
      }),
    )
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useThreadMetadata('t1'), { wrapper: Wrapper })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toEqual({ custom_title: null, pinned: false })

    resolveFetch({ custom_title: null, pinned: false })
  })

  it('reflects the API response after the fetch resolves', async () => {
    mockedFetch.mockResolvedValueOnce({ custom_title: 'Memórias', pinned: true })
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useThreadMetadata('t1'), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual({ custom_title: 'Memórias', pinned: true })
    expect(mockedFetch).toHaveBeenCalledWith('t1')
  })
})

describe('useThreadMetadata — mutateRename', () => {
  it('applies an optimistic update before the network call resolves', async () => {
    mockedFetch.mockResolvedValue({ custom_title: 'Original', pinned: false })

    let resolveUpdate!: (value: ThreadMetadata) => void
    mockedUpdate.mockReturnValueOnce(
      new Promise<ThreadMetadata>((resolve) => {
        resolveUpdate = resolve
      }),
    )

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useThreadMetadata('t1'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data.custom_title).toBe('Original'))

    let renamePromise!: Promise<void>
    act(() => {
      renamePromise = result.current.mutateRename('Novo título')
    })

    await waitFor(() => expect(result.current.data.custom_title).toBe('Novo título'))
    expect(result.current.data.pinned).toBe(false)

    resolveUpdate({ custom_title: 'Novo título', pinned: false })
    await act(async () => {
      await renamePromise
    })
  })

  it('rolls back to the previous value and toasts on API error', async () => {
    mockedFetch.mockResolvedValue({ custom_title: 'Original', pinned: false })
    mockedUpdate.mockRejectedValueOnce(new Error('boom'))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useThreadMetadata('t1'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data.custom_title).toBe('Original'))

    await act(async () => {
      await result.current.mutateRename('Novo título')
    })

    await waitFor(() => expect(result.current.data.custom_title).toBe('Original'))
    expect(mockedToastError).toHaveBeenCalledTimes(1)
  })
})

describe('useThreadMetadata — mutatePin', () => {
  it('flips pinned optimistically and invalidates the query on settle', async () => {
    mockedFetch
      .mockResolvedValueOnce({ custom_title: null, pinned: false })
      .mockResolvedValueOnce({ custom_title: null, pinned: true })
    mockedUpdate.mockResolvedValueOnce({ custom_title: null, pinned: true })

    const { Wrapper, client } = makeWrapper()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useThreadMetadata('t1'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data.pinned).toBe(false))

    await act(async () => {
      await result.current.mutatePin(true)
    })

    expect(result.current.data.pinned).toBe(true)
    expect(mockedUpdate).toHaveBeenCalledWith('t1', { pinned: true })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: threadMetadataQueryKey('t1') })
    expect(mockedFetch).toHaveBeenCalledTimes(2)
  })

  it('rolls back the pin toggle on error', async () => {
    mockedFetch.mockResolvedValue({ custom_title: null, pinned: false })
    mockedUpdate.mockRejectedValueOnce(new Error('nope'))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useThreadMetadata('t1'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.mutatePin(true)
    })

    await waitFor(() => expect(result.current.data.pinned).toBe(false))
    expect(mockedToastError).toHaveBeenCalledTimes(1)
  })
})
