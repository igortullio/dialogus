import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as preferences from '../../src/lib/api/preferences'
import { useSpoilerCap } from '../../src/lib/spoiler-cap'

vi.mock('../../src/lib/api/preferences', () => ({
  fetchSpoilerCaps: vi.fn(),
  updateSpoilerCap: vi.fn(),
}))

const mockedFetch = vi.mocked(preferences.fetchSpoilerCaps)
const mockedUpdate = vi.mocked(preferences.updateSpoilerCap)

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  mockedFetch.mockReset()
  mockedUpdate.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useSpoilerCap', () => {
  it('hydrates the cap from the preferences API on mount (per book)', async () => {
    mockedFetch.mockResolvedValue({ b1: 5 })
    const { result } = renderHook(() => useSpoilerCap('b1'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isLoaded).toBe(true))
    expect(result.current.cap).toBe(5)
    expect(mockedFetch).toHaveBeenCalledWith(['b1'])
  })

  it('returns cap:null when the API has no cap for the book', async () => {
    mockedFetch.mockResolvedValue({ b1: null })
    const { result } = renderHook(() => useSpoilerCap('b1'), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isLoaded).toBe(true))
    expect(result.current.cap).toBeNull()
  })

  it('setCap(10) PUTs to the API and optimistically updates the cap', async () => {
    mockedFetch.mockResolvedValue({ b1: null })
    mockedUpdate.mockResolvedValue(10)
    const { result } = renderHook(() => useSpoilerCap('b1'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isLoaded).toBe(true))

    act(() => result.current.setCap(10))

    await waitFor(() => expect(result.current.cap).toBe(10))
    expect(mockedUpdate).toHaveBeenCalledWith('b1', 10)
  })

  it('setCap(null) clears the cap via the API', async () => {
    mockedFetch.mockResolvedValue({ b1: 5 })
    mockedUpdate.mockResolvedValue(null)
    const { result } = renderHook(() => useSpoilerCap('b1'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.cap).toBe(5))

    act(() => result.current.setCap(null))

    await waitFor(() => expect(result.current.cap).toBeNull())
    expect(mockedUpdate).toHaveBeenCalledWith('b1', null)
  })

  it('rolls back the optimistic cap when the PUT fails', async () => {
    mockedFetch.mockResolvedValue({ b1: 5 })
    mockedUpdate.mockRejectedValue(new Error('nope'))
    const { result } = renderHook(() => useSpoilerCap('b1'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.cap).toBe(5))

    act(() => result.current.setCap(10))

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('b1', 10))
    await waitFor(() => expect(result.current.cap).toBe(5))
  })
})
